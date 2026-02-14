# Aesthetico - Order Status Automation

A Python automation tool that connects to a Google Spreadsheet, reads sales order data, fetches real-time delivery statuses from **Pathao** and **Steadfast** courier APIs, and updates the spreadsheet automatically.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Google Sheets Setup](#1-google-sheets-setup)
  - [Pathao Courier Setup](#2-pathao-courier-setup)
  - [Steadfast Courier Setup](#3-steadfast-courier-setup)
  - [Environment Variables](#4-environment-variables)
- [Usage](#usage)
  - [Run the Full Pipeline](#run-the-full-pipeline)
  - [Test Google Sheets Connection](#test-google-sheets-connection)
  - [Use Individual Modules](#use-individual-modules)
  - [Use in Jupyter Notebook](#use-in-jupyter-notebook)
- [API Reference](#api-reference)
  - [PathaoCourier](#pathaocourier)
  - [SteadfastCourier](#steadfastcourier)
  - [update_order_status Functions](#update_order_status-functions)
- [Delivery Platform Routing](#delivery-platform-routing)
- [Token Management (Pathao)](#token-management-pathao)
- [Error Handling](#error-handling)
- [Google Sheet Structure](#google-sheet-structure)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Overview

This project automates the process of checking delivery statuses for orders placed through Pathao and Steadfast courier services. Instead of manually logging into each courier's dashboard and checking statuses one by one, this tool:

1. Reads all orders from a Google Sheet
2. Identifies which orders have a consignment ID (meaning they've been dispatched)
3. Detects the courier service from the "Delivery Platform" column
4. Calls the correct courier API to get the current delivery status
5. Writes the updated status back to the Google Sheet

---

## How It Works

```
Google Sheet (Sales)
        |
        v
  Read all orders
        |
        v
  Filter: has Consignment ID?
        |
   +---------+---------+
   |                   |
   v                   v
Pathao API        Steadfast API
(order_status)    (delivery_status)
   |                   |
   +---------+---------+
             |
             v
   Update Google Sheet
   (Order Status column)
```

---

## Tech Stack

| Technology | Purpose | Version |
|---|---|---|
| **Python** | Core language | 3.13+ |
| **gspread** | Google Sheets API wrapper | 6.2.1 |
| **google-auth** | Google service account authentication | 2.48.0 |
| **requests** | HTTP client for courier APIs | 2.32.4 |
| **pandas** | Data manipulation and filtering | 2.3.0 |
| **python-dotenv** | Load environment variables from `.env` | 1.1.1 |

### External APIs

| API | Authentication | Documentation |
|---|---|---|
| **Google Sheets API** | Service Account (OAuth2) | [Google Sheets API Docs](https://developers.google.com/sheets/api) |
| **Pathao Courier API** | OAuth2 (client credentials + password grant) | [Pathao Merchant Panel](https://merchant.pathao.com/courier/developer-api) |
| **Steadfast Courier API** | API Key + Secret Key headers | [Steadfast API Docs](https://portal.packzy.com) |

---

## Project Structure

```
Google sheet using python/
|
|-- credentials.json          # Google service account credentials (DO NOT COMMIT)
|-- .env                      # Courier API credentials (DO NOT COMMIT)
|-- token.json                # Pathao cached token (auto-generated, DO NOT COMMIT)
|
|-- connect_sheet.py          # Test script - verify Google Sheets connection
|-- pathao_courier.py         # Pathao API client with token management
|-- steadfast_courier.py      # Steadfast API client
|-- update_order_status.py    # Main pipeline - read, fetch, update
|-- test.ipynb                # Jupyter notebook for experimentation
|
|-- README.md                 # This file
```

---

## Prerequisites

- **Python 3.10+** installed
- **Google Cloud Project** with Sheets API and Drive API enabled
- **Google Service Account** with a JSON credentials file
- **Pathao Merchant Account** with API credentials
- **Steadfast Merchant Account** with API key and secret key

---

## Installation

### 1. Clone or download the project

```bash
cd "your/project/directory"
```

### 2. Install Python dependencies

```bash
pip install gspread google-auth python-dotenv requests pandas
```

Or install all at once with a requirements file:

```bash
pip install gspread==6.2.1 google-auth==2.48.0 python-dotenv==1.1.1 requests==2.32.4 pandas==2.3.0
```

---

## Configuration

### 1. Google Sheets Setup

#### Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API** and **Google Drive API**
4. Go to **IAM & Admin > Service Accounts**
5. Click **Create Service Account**
6. Give it a name (e.g., `sheet-accessor`)
7. Click **Create and Continue** (skip optional steps)
8. Go to the service account > **Keys** tab > **Add Key** > **Create new key** > **JSON**
9. Download the JSON file and rename it to `credentials.json`
10. Place it in the project root directory

#### Share the Spreadsheet

1. Open your Google Spreadsheet
2. Click the **Share** button (top-right)
3. Add the service account email (found in `credentials.json` under `client_email`)
   ```
   your-service-account@your-project.iam.gserviceaccount.com
   ```
4. Set the role to **Editor**
5. Click **Send**

### 2. Pathao Courier Setup

1. Log in to the [Pathao Merchant Panel](https://merchant.pathao.com/)
2. Go to **Developer API** settings
3. Note your **Client ID**, **Client Secret**
4. Your login **email** and **password** are also required

### 3. Steadfast Courier Setup

1. Log in to the [Steadfast Portal](https://portal.packzy.com/)
2. Go to **API Settings**
3. Note your **API Key** and **Secret Key**

### 4. Environment Variables

Create a `.env` file in the project root:

```env
# Pathao Courier
PATHAO_BASE_URL=https://api-hermes.pathao.com
PATHAO_CLIENT_ID=your_client_id
PATHAO_CLIENT_SECRET=your_client_secret
PATHAO_EMAIL=your_email@example.com
PATHAO_PASSWORD=your_password

# Steadfast Courier
STEADFAST_BASE_URL=https://portal.packzy.com/api/v1
STEADFAST_API_KEY=your_api_key
STEADFAST_SECRET_KEY=your_secret_key
```

---

## Usage

### Run the Full Pipeline

This reads the Sales sheet, fetches statuses from Pathao/Steadfast, and updates the Google Sheet:

```bash
python update_order_status.py
```

**Example output:**

```
=== Step 1: Reading Sales Sheet ===
  175 rows loaded.

=== Step 2: Filtering rows with Consignment ID ===
Found 2 row(s) with Consignment ID

=== Step 3: Fetching statuses (auto-detect Pathao / Steadfast) ===
  ORD#20260201-01478 | Pathao | DA010226MAN7CG -> Delivered
  ORD#20260201-01481 | Pathao | DA010226BYHR3Y -> Delivered

=== Step 4: Updating Google Sheet ===
  Row 173: ORD#20260201-01478 -> 'Delivered'
  Row 176: ORD#20260201-01481 -> 'Delivered'

  Updated 2 cell(s) on Google Sheet.

Done!
```

### Test Google Sheets Connection

To verify your `credentials.json` is working and the spreadsheet is accessible:

```bash
python connect_sheet.py
```

### Test Courier APIs Standalone

```bash
# Pathao - by consignment ID
python pathao_courier.py DA010226MAN7CG

# Steadfast - by consignment ID (numeric)
python steadfast_courier.py 123456
```

### Use Individual Modules

Each module can be imported and used independently:

```python
# Pathao
from pathao_courier import PathaoCourier

pathao = PathaoCourier()
order = pathao.get_order_info("DA010226MAN7CG")
print(order["order_status"])  # "Delivered"
```

```python
# Steadfast
from steadfast_courier import SteadfastCourier

sf = SteadfastCourier()
order = sf.get_order_by_consignment("123456")
print(order["delivery_status"])  # "delivered"
```

```python
# Full pipeline functions
from update_order_status import get_sales_sheet, get_rows_with_consignment, fetch_statuses, update_sheet_statuses

sheet, df = get_sales_sheet()
filtered = get_rows_with_consignment(df)
statuses = fetch_statuses(filtered)
update_sheet_statuses(sheet, df, statuses)
```

### Use in Jupyter Notebook

```python
from pathao_courier import PathaoCourier
from steadfast_courier import SteadfastCourier
from update_order_status import *

# Run the full pipeline
run()

# Or use step by step
sheet, df = get_sales_sheet()
df_with_consignment = get_rows_with_consignment(df)
status_map = fetch_statuses(df_with_consignment)
update_sheet_statuses(sheet, df, status_map)
```

---

## API Reference

### PathaoCourier

```python
from pathao_courier import PathaoCourier
```

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `PathaoCourier()` | None | Instance | Creates client, authenticates automatically |
| `.get_order_info(consignment_id)` | `str` | `dict` or `None` | Get order details by Pathao consignment ID |

**Response fields** (from `get_order_info`):

The returned `dict` contains Pathao order data including `order_status`, `delivery_fee`, `cod_amount`, etc.

**Custom Exceptions:**

| Exception | When |
|---|---|
| `PathaoAuthError` | Authentication fails (bad credentials, network error) |
| `EnvironmentError` | Missing `.env` variables |

### SteadfastCourier

```python
from steadfast_courier import SteadfastCourier
```

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `SteadfastCourier()` | None | Instance | Creates client, validates credentials |
| `.get_order_by_consignment(id)` | `str` (numeric) | `dict` or `None` | Get order by consignment ID |
| `.get_order_by_invoice(invoice)` | `str` | `dict` or `None` | Get order by invoice ID |
| `.get_order_by_tracking(code)` | `str` | `dict` or `None` | Get order by tracking code |

**Response fields:**

```json
{
  "status": 200,
  "delivery_status": "delivered"
}
```

**Possible `delivery_status` values:**

`pending`, `in_review`, `delivered`, `delivered_approval_pending`, `partial_delivered`, `partial_delivered_approval_pending`, `cancelled`, `cancelled_approval_pending`, `hold`, `unknown`, `unknown_approval_pending`

### update_order_status Functions

```python
from update_order_status import *
```

| Function | Returns | Description |
|---|---|---|
| `get_sales_sheet()` | `(worksheet, DataFrame)` | Reads the Sales sheet into a pandas DataFrame |
| `get_rows_with_consignment(df)` | `DataFrame` | Filters rows that have a Consignment ID |
| `fetch_statuses(df)` | `dict` | Fetches statuses from Pathao/Steadfast based on Delivery Platform |
| `update_sheet_statuses(sheet, df, status_map)` | `None` | Writes updated statuses back to the Google Sheet |
| `run()` | `None` | Runs the full pipeline (Steps 1-4) |

---

## Delivery Platform Routing

The `Delivery Platform` column in the Sales sheet determines which courier API is called:

| Delivery Platform Value | Courier API | Status Field |
|---|---|---|
| `Pathao Inside` | Pathao | `order_status` |
| `Pathao Outside` | Pathao | `order_status` |
| `Pathao Subcity` | Pathao | `order_status` |
| `Steadfast Inside` | Steadfast | `delivery_status` |
| `Steadfast Outside` | Steadfast | `delivery_status` |
| `Steadfast Subcity` | Steadfast | `delivery_status` |
| `Personal Dev` | **Skipped** | - |
| Any other value | **Skipped** | - |

Courier clients are **lazy-loaded** - they are only initialized if at least one row needs them.

---

## Token Management (Pathao)

Pathao uses OAuth2 with access + refresh tokens. The `PathaoCourier` class manages this automatically:

```
First run:
  No token.json found -> Full login -> Saves tokens

Subsequent runs:
  token.json exists -> Token valid? -> Use cached (0 API calls)
                    -> Token expired? -> Try refresh_token (1 API call)
                    -> Refresh fails? -> Full login (1 API call)

During API call:
  401 Unauthorized? -> Auto-refresh token -> Retry once
```

Tokens are stored in `token.json` alongside the script. The access token is typically valid for **~90 days**.

**Steadfast** does not require token management - it uses static API Key + Secret Key in request headers.

---

## Error Handling

All files include comprehensive error handling for production reliability:

### pathao_courier.py

| Error Scenario | Handling |
|---|---|
| Missing `.env` variables | `EnvironmentError` raised at init with list of missing vars |
| `token.json` corrupted | Warns and falls back to fresh login |
| `token.json` write permission denied | Warns, continues with in-memory token |
| Network down / DNS failure | `requests.ConnectionError` caught, returns `None` |
| Request timeout | `requests.Timeout` caught (10s connect, 30s read limits) |
| API returns non-JSON | `ValueError` caught, returns `None` |
| 401 during API call | Auto-retries once with refreshed token |
| Empty consignment ID | Warns and returns `None` |

### steadfast_courier.py

| Error Scenario | Handling |
|---|---|
| Missing `.env` variables | `EnvironmentError` raised at init |
| Network / timeout errors | All `requests` exceptions caught |
| 401 (bad API key) | Clear message to check `.env` credentials |
| 404 (order not found) | Specific error message |
| 429 (rate limit) | Rate-limit message with retry suggestion |
| Non-JSON response | `ValueError` caught |

### update_order_status.py

| Error Scenario | Handling |
|---|---|
| `credentials.json` missing | `FileNotFoundError` with clear message |
| `credentials.json` invalid | `ValueError` with details |
| Spreadsheet not found | Message with sharing instructions |
| Sales worksheet missing | `WorksheetNotFound` caught |
| Duplicate/empty column headers | `GSpreadException` caught with explanation |
| Required columns missing | Validates upfront before processing |
| Courier client init fails | Sets sentinel, skips all orders for that courier |
| Individual order fetch fails | Logs error, continues to next row |
| Google API rate limit on update | Caught with retry suggestion |
| `Ctrl+C` interrupt | Clean exit |
| Any unexpected error | Top-level catch with error type and message |

---

## Google Sheet Structure

The Sales sheet must have these **required columns** (order doesn't matter):

| Column | Description | Example |
|---|---|---|
| `Order ID` | Unique order identifier | `ORD#20260201-01478` |
| `Consignment ID` | Courier tracking ID (empty if not dispatched) | `DA010226MAN7CG` |
| `Delivery Platform` | Courier service name | `Pathao Inside` |
| `Order Status` | Current delivery status (updated by this tool) | `Delivered` |

Other columns present in the sheet (`Date`, `Customer Name`, `Product ID`, `Quantity`, `Total Price`, `Discount`, `Discounted Price`, `Delivery Cost`, `Payable Amount`, `Advance Payment`, `Due Payment`, `Sales By`, `Return Reason`, `Dispatch Date`) are read but not modified.

---

## Security Notes

The following files contain sensitive credentials and **must not be committed to version control**:

| File | Contains |
|---|---|
| `credentials.json` | Google service account private key |
| `.env` | Pathao & Steadfast API credentials |
| `token.json` | Pathao access & refresh tokens |

Add these to your `.gitignore`:

```gitignore
credentials.json
.env
token.json
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `SpreadsheetNotFound` | Share the spreadsheet with the service account email in `credentials.json` (`client_email` field) |
| `Spreadsheet has duplicate headers` | Check the Sales sheet for empty or duplicate column names in row 1 |
| `Missing required env variable(s)` | Ensure all variables are set in the `.env` file (no quotes needed for values) |
| `Pathao login failed (401)` | Verify `PATHAO_EMAIL` and `PATHAO_PASSWORD` in `.env` are correct |
| `Steadfast auth failed (401)` | Verify `STEADFAST_API_KEY` and `STEADFAST_SECRET_KEY` in `.env` |
| `Steadfast: Id must be numeric` | Steadfast consignment IDs are numeric only (e.g., `123456`) |
| `Network error / Timeout` | Check your internet connection; the APIs may also be temporarily down |
| `Google API rate limit` | Wait 1-2 minutes and try again; Google Sheets API has a quota of 60 requests/minute |
| `token.json is malformed` | Delete `token.json` and run again - a fresh token will be generated |
