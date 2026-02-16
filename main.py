import os
import sys
from contextlib import asynccontextmanager
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List
from pydantic import BaseModel

from sheets_service import SheetsService
from auth_service import create_access_token, verify_access_token

# ── Globals ──────────────────────────────────────────────────────────────────

sheets: SheetsService = None  # Initialized at startup


# ── Pydantic Models ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    email: str
    role: str


class ProductItem(BaseModel):
    product_details: str  # Display Name from Inventory
    quantity: int


class InsertOrderRequest(BaseModel):
    date: str
    customer_name: str
    customer_contact: str
    customer_address: str
    customer_type: str = ""
    products: List[ProductItem]


# ── Auth Dependency ──────────────────────────────────────────────────────────

async def get_current_user(request: Request) -> dict:
    """
    Extract and verify JWT from Authorization header.
    Returns user payload dict: {username, email, role, exp}.
    Raises 401 if token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    token = auth_header.replace("Bearer ", "")
    payload = verify_access_token(token)

    if payload is None:
        raise HTTPException(status_code=401, detail="Token expired or invalid. Please log in again.")

    return payload


async def get_optional_user(request: Request) -> Optional[dict]:
    """
    Same as get_current_user but returns None instead of raising 401.
    Used for endpoints that work differently when authenticated vs not.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.replace("Bearer ", "")
    return verify_access_token(token)


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the Google Sheets client once when the server starts."""
    global sheets
    try:
        sheets = SheetsService()
        print("Google Sheets service initialized.")
    except (FileNotFoundError, ValueError, ConnectionError) as e:
        print(f"FATAL: Could not initialize Google Sheets: {e}")
        sys.exit(1)
    yield
    print("Server shutting down.")


# ── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Aesthetico Dashboard",
    description="Google Sheets viewer + Courier status updater",
    lifespan=lifespan,
)

# CORS — allow frontend JS to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (CSS, JS, images)
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def index():
    """Serve the dashboard landing page."""
    return FileResponse(os.path.join(static_dir, "index.html"))


@app.get("/login")
async def login_page():
    """Serve the login page."""
    return FileResponse(os.path.join(static_dir, "login.html"))


@app.get("/sheets/{sheet_file}.html")
async def serve_sheet_page(sheet_file: str):
    """Serve sheet-specific HTML pages from the sheets/ directory."""
    file_path = os.path.join(static_dir, "sheets", f"{sheet_file}.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Sheet page not found")


# ── Auth Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """
    Authenticate user against the UserName sheet.
    Returns a JWT token on success.
    """
    user = sheets.validate_user(req.email, req.password)

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    # Create JWT token
    token = create_access_token({
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
    })

    # Update lastActive in background (non-blocking, best-effort)
    try:
        sheets.update_last_active(user["email"])
    except Exception as e:
        print(f"  WARNING: Could not update lastActive: {e}")

    return LoginResponse(
        token=token,
        username=user["username"],
        email=user["email"],
        role=user["role"],
    )


@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current user's info from the JWT token."""
    return {
        "username": user.get("username"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


# ── Sheet Endpoints (Protected) ─────────────────────────────────────────────

@app.get("/api/sheets")
async def list_sheets(user: dict = Depends(get_current_user)):
    """Return a list of sheet names the user's role can access."""
    try:
        role = user.get("role", "moderator")
        accessible_names = sheets.get_sheets_for_role(role)
        config = sheets.get_sheet_config()

        sheet_list = []
        for name in accessible_names:
            cfg = config.get(name, {"header_row": 1, "columns": None})
            sheet_list.append({
                "name": name,
                "header_row": cfg.get("header_row", 1),
                "columns": cfg.get("columns"),
            })
        return {"sheets": sheet_list}
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/config")
async def get_config(user: dict = Depends(get_current_user)):
    """Return the full sheets config (admin only)."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return sheets.get_sheet_config()


@app.get("/api/sheets/{sheet_name}")
async def get_sheet(sheet_name: str, user: dict = Depends(get_current_user)):
    """Return all data from a specific sheet (if user has access)."""
    role = user.get("role", "moderator")

    if not sheets.can_access_sheet(sheet_name, role):
        raise HTTPException(status_code=403, detail=f"You don't have access to '{sheet_name}'.")

    try:
        data = sheets.get_sheet_data(sheet_name)

        # Apply role-based column filtering
        filtered_headers, filtered_rows = sheets.filter_columns_for_role(
            sheet_name, role, data["headers"], data["rows"]
        )
        data["headers"] = filtered_headers
        data["rows"] = filtered_rows

        return data
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/update-statuses")
async def update_statuses(user: dict = Depends(get_current_user)):
    """
    Trigger the order status update pipeline (admin only).
    1. Read Sales sheet
    2. Filter rows with Consignment ID
    3. Fetch statuses from Pathao / Steadfast
    4. Update the Google Sheet
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required to update statuses.")

    # Import the existing functions from update_order_status.py
    from update_order_status import (
        get_rows_with_consignment,
        fetch_statuses,
        _detect_platform,
    )
    import gspread

    results = {
        "total_rows": 0,
        "with_consignment": 0,
        "updated": 0,
        "details": [],
        "errors": [],
    }

    # Step 1: Read Sales sheet
    try:
        sheet_data = sheets.get_sheet_data("Sales")
        worksheet = sheets.get_worksheet("Sales")
    except (KeyError, ConnectionError) as e:
        raise HTTPException(status_code=502, detail=f"Could not read Sales sheet: {e}")

    if not sheet_data["rows"]:
        return results

    df = pd.DataFrame(sheet_data["rows"], columns=sheet_data["headers"])
    results["total_rows"] = len(df)

    # Step 2: Filter rows with Consignment ID
    df_with_consignment = get_rows_with_consignment(df)
    results["with_consignment"] = len(df_with_consignment)

    if df_with_consignment.empty:
        return results

    # Step 3: Fetch statuses
    status_map = fetch_statuses(df_with_consignment)

    # Step 4: Update Google Sheet
    if status_map:
        try:
            # Use the config-aware header row for Sales
            sales_header_row = sheet_data.get("config", {}).get("header_row", 1)
            headers = worksheet.row_values(sales_header_row)
            order_id_col = headers.index("Order ID") + 1
            status_col = headers.index("Order Status") + 1
            order_id_values = worksheet.col_values(order_id_col)

            updates = []
            for order_id, new_status in status_map.items():
                try:
                    row_num = order_id_values.index(order_id) + 1
                    updates.append(gspread.Cell(row_num, status_col, new_status))
                    results["details"].append({
                        "order_id": order_id,
                        "status": new_status,
                        "row": row_num,
                    })
                except ValueError:
                    results["errors"].append(f"Order ID '{order_id}' not found in sheet")

            if updates:
                worksheet.update_cells(updates)
                results["updated"] = len(updates)

        except gspread.exceptions.APIError as e:
            results["errors"].append(f"Google Sheets update failed: {e}")
        except ValueError as e:
            results["errors"].append(f"Column not found: {e}")

    return results


# ── Sales Raw Insert Endpoints ───────────────────────────────────────────────

@app.get("/api/products")
async def get_products(user: dict = Depends(get_current_user)):
    """Return list of product Display Names from Inventory for dropdown."""
    try:
        data = sheets.get_sheet_data("Inventory")
        headers = data["headers"]

        disp_idx = None
        for i, h in enumerate(headers):
            if h.strip() == "Display Name":
                disp_idx = i
                break

        if disp_idx is None:
            raise HTTPException(status_code=500, detail="Display Name column not found in Inventory.")

        products = []
        for row in data["rows"]:
            val = row[disp_idx].strip() if disp_idx < len(row) else ""
            if val:
                products.append(val)

        return {"products": sorted(products)}
    except (KeyError, ConnectionError) as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/sales-raw/insert")
async def insert_sales_raw(req: InsertOrderRequest, user: dict = Depends(get_current_user)):
    """
    Insert one or more rows into the Sales Raw sheet.
    Each product creates a separate row with the same SL, date, and customer info.
    Formula columns (Order ID, Product ID, Product Price, Total Price, Order Status,
    PurchasePrice) are left empty so the sheet formulas auto-fill them.
    """
    if not req.products:
        raise HTTPException(status_code=400, detail="At least one product is required.")

    import gspread

    try:
        worksheet = sheets.get_worksheet("Sales Raw")
    except (KeyError, ConnectionError) as e:
        raise HTTPException(status_code=502, detail=f"Could not access Sales Raw sheet: {e}")

    try:
        # Get the last SL No. to determine the next one
        sl_col_values = worksheet.col_values(2)  # Column B = SL No. (1-based)

        # Find the last numeric SL value
        last_sl = 0
        for val in reversed(sl_col_values):
            val = val.strip()
            if val.isdigit():
                last_sl = int(val)
                break

        next_sl = last_sl + 1

        # Find the next empty row (after all data)
        all_values = worksheet.get_all_values()
        next_row = len(all_values) + 1

        # Build rows to insert
        # Columns: Order ID(A), SL No.(B), Date(C), Customer Name(D),
        #          Customer Contact(E), Customer Address(F), Product Details(G),
        #          Product ID(H), Quantity(I), Customer Type(J), Product Price(K),
        #          Total Price(L), Order Status(M), PurchasePrice(N), Remark(O)
        #
        # Formula cols: A (Order ID), H (Product ID), K (Product Price),
        #               L (Total Price), M (Order Status), N (PurchasePrice)
        # We leave them empty — the sheet formulas handle them.
        #=IF(OR(B232="",C232=""),"","ORD#"&TEXT(C232,"YYYYMMDD")&"-"&TEXT(B232,"00000"))
        order_id_formula=f'=IF(OR(B{next_row}="",C{next_row}=""),"","ORD#"&TEXT(C{next_row},"YYYYMMDD")&"-"&TEXT(B{next_row},"00000"))'
        #IF(AND(G232<>"", ISNUMBER(FIND("|", G232))), LEFT(G232, FIND("|", G232) - 2), "")
        product_id_formula=f'=IF(AND(G{next_row}<>"", ISNUMBER(FIND("|", G{next_row}))), LEFT(G{next_row}, FIND("|", G{next_row}) - 2), "")'
        
        #  =IF(H232="", "", IF(J232="Retail",XLOOKUP(H232, Inventory!A$2:A, Inventory!H$2:H, ""),    XLOOKUP(H232, Inventory!A$2:A, Inventory!I$2:I, "")))
        product_price_formula=f'=IF(H{next_row}="", "", IF(J{next_row}="Retail",XLOOKUP(H{next_row}, Inventory!A$2:A, Inventory!H$2:H, ""),    XLOOKUP(H{next_row}, Inventory!A$2:A, Inventory!I$2:I, "")))'
        # =IF(OR(I232="", K232=""), "", I232*K232)
        total_price_formula=f'=IF(OR(I{next_row}="", K{next_row}=""), "", I{next_row}*K{next_row})'

        # =IF(A232="","",XLOOKUP(A232,Sales!$A$2:A3664,Sales!$N$2:N3664))
        order_status_formula=f'=IF(A{next_row}="","",XLOOKUP(A{next_row},Sales!$A$2:A3664,Sales!$M$2:M3664))'

        # =IF(H232="", "", XLOOKUP(H232, Inventory!A$2:A, Inventory!G$2:G, ""))
        purchase_price_formula=f'=IF(H{next_row}="", "", XLOOKUP(H{next_row}, Inventory!A$2:A, Inventory!G$2:G, ""))'


        rows_to_insert = []
        for product in req.products:
            row = [
                order_id_formula,          # A: Order ID (formula)
                str(next_sl),              # B: SL No.
                req.date,                  # C: Date
                req.customer_name,         # D: Customer Name
                req.customer_contact,      # E: Customer Contact
                req.customer_address,      # F: Customer Address
                product.product_details,   # G: Product Details
                product_id_formula,        # H: Product ID (formula)
                str(product.quantity),     # I: Quantity
                req.customer_type,         # J: Customer Type
                product_price_formula,     # K: Product Price (formula)
                total_price_formula,       # L: Total Price (formula)
                order_status_formula,      # M: Order Status (formula)
                purchase_price_formula,    # N: PurchasePrice (formula)
                "",                        # O: Remark
            ]
            rows_to_insert.append(row)

        # Batch update — write all rows at once
        cell_range = f"A{next_row}:O{next_row + len(rows_to_insert) - 1}"
        worksheet.update(values=rows_to_insert, range_name=cell_range, value_input_option="USER_ENTERED")

        return {
            "success": True,
            "sl_no": next_sl,
            "rows_inserted": len(rows_to_insert),
            "start_row": next_row,
            "message": f"Inserted {len(rows_to_insert)} row(s) with SL #{next_sl}",
        }

    except gspread.exceptions.APIError as e:
        raise HTTPException(status_code=502, detail=f"Google Sheets API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insert failed: {e}")


# ── Run Server ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
