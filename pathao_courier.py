import requests
import os
import json
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

_BASE_URL = os.getenv("PATHAO_BASE_URL")
_CLIENT_ID = os.getenv("PATHAO_CLIENT_ID")
_CLIENT_SECRET = os.getenv("PATHAO_CLIENT_SECRET")
_EMAIL = os.getenv("PATHAO_EMAIL")
_PASSWORD = os.getenv("PATHAO_PASSWORD")
_TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.json")

# Request timeout in seconds (connect, read)
_TIMEOUT = (10, 30)


class PathaoAuthError(Exception):
    """Raised when Pathao authentication fails completely."""
    pass


class PathaoAPIError(Exception):
    """Raised when a Pathao API call fails."""
    pass


class PathaoCourier:
    """
    Pathao Courier API client with automatic token management.

    Usage:
        from pathao_courier import PathaoCourier

        pathao = PathaoCourier()
        order  = pathao.get_order_info("DA250XXXXXXX")
    """

    def __init__(self):
        # Validate env vars at init time
        missing = []
        if not _BASE_URL:
            missing.append("PATHAO_BASE_URL")
        if not _CLIENT_ID:
            missing.append("PATHAO_CLIENT_ID")
        if not _CLIENT_SECRET:
            missing.append("PATHAO_CLIENT_SECRET")
        if not _EMAIL:
            missing.append("PATHAO_EMAIL")
        if not _PASSWORD:
            missing.append("PATHAO_PASSWORD")
        if missing:
            raise EnvironmentError(
                f"Missing required env variable(s): {', '.join(missing)}. "
                "Check your .env file."
            )

        self.base_url = _BASE_URL
        self.client_id = _CLIENT_ID
        self.client_secret = _CLIENT_SECRET
        self.email = _EMAIL
        self.password = _PASSWORD
        self.token_file = _TOKEN_FILE
        self._access_token = None
        self._ensure_token()

    # ── Token Storage ────────────────────────────────────────────────────────

    def _save_tokens(self, access_token, refresh_token, expires_in):
        data = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": time.time() + expires_in,
        }
        try:
            with open(self.token_file, "w") as f:
                json.dump(data, f, indent=2)
        except (OSError, IOError) as e:
            print(f"  WARNING: Could not save token file: {e}")

    def _load_tokens(self):
        if not os.path.exists(self.token_file):
            return None
        try:
            with open(self.token_file, "r") as f:
                data = json.load(f)
            # Validate required keys exist
            if "access_token" not in data or "expires_at" not in data:
                print("  WARNING: token.json is malformed, ignoring cached tokens.")
                return None
            return data
        except (json.JSONDecodeError, OSError, IOError) as e:
            print(f"  WARNING: Could not read token file: {e}")
            return None

    # ── Token Requests ───────────────────────────────────────────────────────

    def _request_new_token(self):
        """Full login with credentials."""
        url = f"{self.base_url}/aladdin/api/v1/issue-token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "password",
            "username": self.email,
            "password": self.password,
        }

        try:
            resp = requests.post(
                url, json=payload,
                headers={"Content-Type": "application/json"},
                timeout=_TIMEOUT,
            )
        except requests.ConnectionError:
            raise PathaoAuthError("Network error: Could not connect to Pathao API. Check your internet.")
        except requests.Timeout:
            raise PathaoAuthError("Timeout: Pathao token request took too long.")
        except requests.RequestException as e:
            raise PathaoAuthError(f"Request failed: {e}")

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                raise PathaoAuthError("Pathao returned non-JSON response during login.")

            if "access_token" not in data or "refresh_token" not in data:
                raise PathaoAuthError(f"Unexpected login response: {data}")

            self._save_tokens(data["access_token"], data["refresh_token"], data.get("expires_in", 432000))
            self._access_token = data["access_token"]
            return True

        raise PathaoAuthError(
            f"Login failed (HTTP {resp.status_code}): {resp.text[:300]}"
        )

    def _refresh_token(self, refresh_token):
        """Use refresh token to get a new access token."""
        url = f"{self.base_url}/aladdin/api/v1/issue-token"
        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }

        try:
            resp = requests.post(
                url, json=payload,
                headers={"Content-Type": "application/json"},
                timeout=_TIMEOUT,
            )
        except requests.RequestException:
            return False

        if resp.status_code == 200:
            try:
                data = resp.json()
            except ValueError:
                return False

            if "access_token" not in data:
                return False

            new_refresh = data.get("refresh_token", refresh_token)
            self._save_tokens(data["access_token"], new_refresh, data.get("expires_in", 432000))
            self._access_token = data["access_token"]
            return True

        return False

    # ── Main Token Logic ─────────────────────────────────────────────────────

    def _ensure_token(self):
        """
        Smart token retrieval:
          1. Cached token still valid  -> use it
          2. Expired -> try refresh_token
          3. Refresh fails -> full login
        """
        tokens = self._load_tokens()

        if tokens:
            remaining = tokens.get("expires_at", 0) - time.time()

            # Still valid
            if remaining > 60:
                self._access_token = tokens["access_token"]
                return

            # Try refresh
            refresh_tk = tokens.get("refresh_token")
            if refresh_tk and self._refresh_token(refresh_tk):
                return

        # Full login (raises PathaoAuthError on failure)
        self._request_new_token()

    # ── API Helpers ──────────────────────────────────────────────────────────

    def _headers(self):
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    # ── Public Methods ───────────────────────────────────────────────────────

    def get_order_info(self, consignment_id):
        """
        Get order information by consignment ID.

        Args:
            consignment_id (str): The Pathao consignment ID (e.g. "DA250XXXXXXX")

        Returns:
            dict: Order data from the API, or None on failure.
        """
        if not consignment_id or not str(consignment_id).strip():
            print("  WARNING: Empty consignment ID provided, skipping.")
            return None

        url = f"{self.base_url}/aladdin/api/v1/orders/{consignment_id}"

        try:
            resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
        except requests.ConnectionError:
            print(f"  ERROR: Network error fetching order {consignment_id}")
            return None
        except requests.Timeout:
            print(f"  ERROR: Timeout fetching order {consignment_id}")
            return None
        except requests.RequestException as e:
            print(f"  ERROR: Request failed for {consignment_id}: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json().get("data", resp.json())
            except ValueError:
                print(f"  ERROR: Non-JSON response for {consignment_id}")
                return None

        # If 401, token might have expired mid-session -- retry once
        if resp.status_code == 401:
            try:
                self._ensure_token()
                resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
                if resp.status_code == 200:
                    return resp.json().get("data", resp.json())
            except (PathaoAuthError, requests.RequestException, ValueError) as e:
                print(f"  ERROR: Retry failed for {consignment_id}: {e}")
                return None

        print(f"  ERROR [{resp.status_code}] for {consignment_id}: {resp.text[:200]}")
        return None
    def get_city_list(self):
        """
        Get list of cities from Pathao API.

        Returns:
            list: List of cities, or None on failure.
        """
        #{{base_url}}/aladdin/api/v1/city-list'
        url = f"{self.base_url}/aladdin/api/v1/city-list"

        try:
            resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
        except requests.RequestException as e:
            print(f"  ERROR: Failed to fetch city list: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json().get("data", resp.json())
            except ValueError:
                print("  ERROR: Non-JSON response when fetching city list.")
                return None

        print(f"  ERROR [{resp.status_code}] fetching city list: {resp.text[:200]}")
        return None

    def get_zones_by_city(self, city_id):
        """
        Get list of zones for a given city ID.

        Args:
            city_id (int): The ID of the city.

        Returns:
            list: List of zones for the specified city, or None on failure.
        """
        #/aladdin/api/v1/cities/{{city_id}}/zone-list
        url = f"{self.base_url}/aladdin/api/v1/cities/{city_id}/zone-list"

        try:
            resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
        except requests.RequestException as e:
            print(f"  ERROR: Failed to fetch zones for city {city_id}: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json().get("data", resp.json())
            except ValueError:
                print(f"  ERROR: Non-JSON response when fetching zones for city {city_id}.")
                return None

        print(f"  ERROR [{resp.status_code}] fetching zones for city {city_id}: {resp.text[:200]}")
        return None
    def get_area_of_a_zone(self, zone_id):
        """
        Get list of areas for a given zone ID.

        Args:
            zone_id (int): The ID of the zone.
        Returns:
            list: List of areas for the specified zone, or None on failure.
        """
        #{{base_url}}/aladdin/api/v1/zones/{{zone_id}}/area-list
        url = f"{self.base_url}/aladdin/api/v1/zones/{zone_id}/area-list"

        try:
            resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
        except requests.RequestException as e:
            print(f"  ERROR: Failed to fetch areas for zone {zone_id}: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json().get("data", resp.json())
            except ValueError:
                print(f"  ERROR: Non-JSON response when fetching areas for zone {zone_id}.")
                return None

        print(f"  ERROR [{resp.status_code}] fetching areas for zone {zone_id}: {resp.text[:200]}")
        return None
    
    def delivery_charge_calculation(self, store_id, item_type, delivery_type, item_weight, recipient_city, recipient_zone):
        """
        curl --location '{{base_url}}/aladdin/api/v1/merchant/price-plan'
            --header 'Content-Type: application/json; charset=UTF-8'
            --header 'Authorization: Bearer {{issue_token}}'
            --data '{
            "store_id": "{{merchant_store_id}}",
            "item_type": 2,
            "delivery_type": 48,
            "item_weight": 0.5,
            "recipient_city": {{city_id}},
            "recipient_zone": {{zone_id}}
            }'
        item_type: 1 for documents, 2 for parcel, delivery_type: 48 for normal,12 for express
        item_weight in kg, recipient_city is city_id, recipient_zone is zone_id
        Calculate delivery charge based on city, weight, and zone.

        Args:
            city_id (int): The ID of the city.
            weight (float): The weight of the package in kg.
            zone_id (int): The ID of the delivery zone.
        Returns:
            dict: Delivery charge details from the API, or None on failure.
        """
        url = f"{self.base_url}/aladdin/api/v1/merchant/price-plan"
        payload = {
            "store_id": store_id,
            "item_type": item_type,
            "delivery_type": delivery_type,
            "item_weight": item_weight,
            "recipient_city": recipient_city,
            "recipient_zone": recipient_zone
        }

        try:
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=_TIMEOUT)
        except requests.RequestException as e:
            print(f"  ERROR: Failed to calculate delivery charge: {e}")
            return None

        if resp.status_code == 200:
            try:
                return resp.json().get("data", resp.json())
            except ValueError:
                print("  ERROR: Non-JSON response when calculating delivery charge.")
                return None

        print(f"  ERROR [{resp.status_code}] calculating delivery charge: {resp.text[:200]}")
        return None


# ── Entry Point (standalone usage) ───────────────────────────────────────────

if __name__ == "__main__":
    import sys

    try:
        pathao = PathaoCourier()
        print("Pathao client ready. Token loaded.")
    except (EnvironmentError, PathaoAuthError) as e:
        print(f"FATAL: {e}")
        sys.exit(1)

    if len(sys.argv) > 1:
        consignment_id = sys.argv[1]
        order = pathao.get_order_info(consignment_id)
        if order:
            print(f"\n=== Order: {consignment_id} ===")
            for k, v in order.items():
                print(f"  {k}: {v}")
        else:
            print(f"\nCould not retrieve order for: {consignment_id}")
    else:
        print("\nUsage: python pathao_courier.py <consignment_id>")
        print("Example: python pathao_courier.py DA2501234XXXXXX")
