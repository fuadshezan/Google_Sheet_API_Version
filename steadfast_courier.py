import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

_BASE_URL = os.getenv("STEADFAST_BASE_URL")
_API_KEY = os.getenv("STEADFAST_API_KEY")
_SECRET_KEY = os.getenv("STEADFAST_SECRET_KEY")

# Request timeout in seconds (connect, read)
_TIMEOUT = (10, 30)


class SteadfastAPIError(Exception):
    """Raised when a Steadfast API call fails."""
    pass


class SteadfastCourier:
    """
    Steadfast Courier API client.

    Authentication uses Api-Key and Secret-Key headers (no token management needed).

    Usage:
        from steadfast_courier import SteadfastCourier

        sf = SteadfastCourier()
        order = sf.get_order_by_consignment("XXXXXX")
        order = sf.get_order_by_invoice("INV-001")
        order = sf.get_order_by_tracking("TRACK-001")
    """

    def __init__(self):
        # Validate env vars at init time
        missing = []
        if not _BASE_URL:
            missing.append("STEADFAST_BASE_URL")
        if not _API_KEY:
            missing.append("STEADFAST_API_KEY")
        if not _SECRET_KEY:
            missing.append("STEADFAST_SECRET_KEY")
        if missing:
            raise EnvironmentError(
                f"Missing required env variable(s): {', '.join(missing)}. "
                "Check your .env file."
            )

        self.base_url = _BASE_URL
        self.api_key = _API_KEY
        self.secret_key = _SECRET_KEY

    def _headers(self):
        return {
            "Api-Key": self.api_key,
            "Secret-Key": self.secret_key,
            "Content-Type": "application/json",
        }

    # -- Public Methods -------------------------------------------------------

    def get_order_by_consignment(self, consignment_id):
        """
        Get order info by consignment ID.

        Args:
            consignment_id (str): The Steadfast consignment ID.

        Returns:
            dict: Full response from API, or None on failure.
        """
        if not consignment_id or not str(consignment_id).strip():
            print("  WARNING: Empty consignment ID provided, skipping.")
            return None
        url = f"{self.base_url}/status_by_cid/{consignment_id}"
        return self._get(url, consignment_id)

    def get_order_by_invoice(self, invoice_id):
        """
        Get order info by invoice ID.

        Args:
            invoice_id (str): Your unique invoice identifier.

        Returns:
            dict: Full response from API, or None on failure.
        """
        if not invoice_id or not str(invoice_id).strip():
            print("  WARNING: Empty invoice ID provided, skipping.")
            return None
        url = f"{self.base_url}/status_by_invoice/{invoice_id}"
        return self._get(url, invoice_id)

    def get_order_by_tracking(self, tracking_code):
        """
        Get order info by tracking code.

        Args:
            tracking_code (str): The tracking code.

        Returns:
            dict: Full response from API, or None on failure.
        """
        if not tracking_code or not str(tracking_code).strip():
            print("  WARNING: Empty tracking code provided, skipping.")
            return None
        url = f"{self.base_url}/status_by_trackingcode/{tracking_code}"
        return self._get(url, tracking_code)

    # -- Internal -------------------------------------------------------------

    def _get(self, url, identifier=""):
        """Make a GET request with full error handling."""
        try:
            resp = requests.get(url, headers=self._headers(), timeout=_TIMEOUT)
        except requests.ConnectionError:
            print(f"  ERROR: Network error fetching Steadfast order {identifier}")
            return None
        except requests.Timeout:
            print(f"  ERROR: Timeout fetching Steadfast order {identifier}")
            return None
        except requests.RequestException as e:
            print(f"  ERROR: Request failed for Steadfast {identifier}: {e}")
            return None

        # Parse JSON safely
        try:
            data = resp.json()
        except ValueError:
            print(f"  ERROR: Non-JSON response from Steadfast for {identifier}")
            return None

        if resp.status_code == 200:
            if data.get("status") == 200:
                return data
            else:
                print(f"  WARNING: Steadfast API error for {identifier}: {data}")
                return data

        if resp.status_code == 401:
            print(f"  ERROR: Steadfast auth failed (401). Check API Key / Secret Key in .env")
            return None

        if resp.status_code == 404:
            print(f"  ERROR: Steadfast order not found: {identifier}")
            return None

        if resp.status_code == 429:
            print(f"  ERROR: Steadfast rate limit exceeded. Try again later.")
            return None

        print(f"  ERROR: Steadfast [{resp.status_code}] for {identifier}: {str(data)[:200]}")
        return None


# -- Entry Point (standalone test) --------------------------------------------

if __name__ == "__main__":
    import sys

    try:
        sf = SteadfastCourier()
        print("Steadfast client ready.")
    except EnvironmentError as e:
        print(f"FATAL: {e}")
        sys.exit(1)

    if len(sys.argv) > 1:
        consignment_id = sys.argv[1]
        result = sf.get_order_by_consignment(consignment_id)
        if result:
            print(f"\n=== Order: {consignment_id} ===")
            for k, v in result.items():
                print(f"  {k}: {v}")
        else:
            print(f"\nCould not retrieve order for: {consignment_id}")
    else:
        print("\nUsage: python steadfast_courier.py <consignment_id>")
        print("Example: python steadfast_courier.py 123456")
