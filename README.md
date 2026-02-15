# Aesthetico - Order Management Dashboard

A full-stack web application for managing orders, inventory, and delivery statuses. Built with FastAPI backend and vanilla JavaScript frontend, integrated with Google Sheets for data storage and Pathao/Steadfast courier APIs for real-time delivery tracking.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Google Sheets Setup](#1-google-sheets-setup)
  - [Pathao Courier Setup](#2-pathao-courier-setup)
  - [Steadfast Courier Setup](#3-steadfast-courier-setup)
  - [Environment Variables](#4-environment-variables)
  - [Sheets Configuration](#5-sheets-configuration)
  - [User Management](#6-user-management)
- [Usage](#usage)
  - [Running the Application](#running-the-application)
  - [Testing Components](#testing-components)
- [API Reference](#api-reference)
  - [Authentication](#authentication)
  - [Sheet Operations](#sheet-operations)
  - [Order Management](#order-management)
  - [Status Updates](#status-updates)
- [Role-Based Access Control](#role-based-access-control)
- [Image Handling](#image-handling)
- [Token Management (Pathao)](#token-management-pathao)
- [Error Handling](#error-handling)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Overview

This application provides a modern web interface for managing an e-commerce business through Google Sheets. It replaces manual spreadsheet access with a role-based dashboard that:

- **Authenticates users** via JWT tokens with role-based permissions
- **Displays Google Sheet data** in searchable, sortable DataTables
- **Filters columns** based on user roles (admin/moderator)
- **Renders product images** with hover zoom
- **Inserts new orders** directly to Sales Raw sheet
- **Auto-updates delivery statuses** from Pathao/Steadfast APIs
- **Tracks user activity** (last active timestamps)

---

## Features

### Authentication & Authorization
- JWT-based authentication with secure token storage
- Role-based access control (Admin, Moderator)
- Automatic token validation and refresh
- User session tracking

### Sheet Management
- Dynamic sheet listing based on user role
- Configurable header rows and column ranges
- Column visibility control per role
- Real-time data refresh

### Order Management
- **Insert Orders**: Add new orders with multiple products to Sales Raw sheet
- **Product Search**: Select2-powered searchable product dropdowns
- **Auto-calculations**: Order IDs, Product IDs, prices, and status formulas auto-generated
- **Date formatting**: Automatic date conversion for sheet compatibility

### Delivery Status Automation
- Automatic detection of courier service (Pathao/Steadfast) from "Delivery Platform" column
- Real-time status fetching via courier APIs
- Bulk update of Order Status column
- Admin-only access to status update functionality

### Image Support
- Automatic image detection in configured columns
- Thumbnail display in tables
- Hover zoom preview (320x380px popup)
- Support for direct URLs, Google Drive, Cloudinary, Imgur

### UI/UX Features
- Responsive sidebar navigation
- Bootstrap 5.3 modern design
- DataTables integration (search, sort, pagination)
- Toast notifications for user feedback
- Loading overlays with status text
- Empty state placeholders

---

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│   Browser   │◄───────►│  FastAPI     │◄───────►│  Google Sheets  │
│  (JS/HTML)  │  HTTP   │   Backend    │  gspread│    (Data)       │
└─────────────┘         └──────┬───────┘         └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
            ┌──────────────┐      ┌──────────────┐
            │   Pathao     │      │  Steadfast   │
            │   API        │      │   API        │
            └──────────────┘      └──────────────┘
```

**Flow:**
1. User logs in → Backend validates credentials from UserName sheet → Issues JWT token
2. Frontend requests sheet list → Backend filters by role → Returns accessible sheets
3. User selects sheet → Backend fetches data → Applies column filters → Returns JSON
4. Frontend renders data in DataTables with image support
5. Admin clicks "Update Statuses" → Backend reads Sales sheet → Calls courier APIs → Updates sheet
6. User inserts order → Backend validates → Writes to Sales Raw → Formulas auto-calculate

---

## Tech Stack

### Backend
| Technology | Purpose | Version |
|---|---|---|
| **Python** | Core language | 3.13+ |
| **FastAPI** | Web framework | Latest |
| **Uvicorn** | ASGI server | Latest |
| **gspread** | Google Sheets API wrapper | 6.2.1 |
| **google-auth** | Service account authentication | 2.48.0 |
| **PyJWT** | JWT token generation/validation | Latest |
| **requests** | HTTP client for courier APIs | 2.32.4 |
| **pandas** | Data manipulation | 2.3.0 |
| **python-dotenv** | Environment variables | 1.1.1 |

### Frontend
| Technology | Purpose |
|---|---|
| **Vanilla JavaScript** | Client-side logic |
| **Bootstrap 5.3** | UI framework |
| **DataTables** | Table rendering with search/sort |
| **Select2** | Enhanced dropdowns |
| **Bootstrap Icons** | Icon library |

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
│
├── main.py                    # FastAPI application entry point
├── auth_service.py            # JWT token creation/verification
├── sheets_service.py          # Google Sheets operations & role filtering
├── pathao_courier.py          # Pathao API client with OAuth2
├── steadfast_courier.py       # Steadfast API client
├── update_order_status.py     # Standalone status update pipeline
│
├── credentials.json           # Google service account (DO NOT COMMIT)
├── .env                       # API credentials (DO NOT COMMIT)
├── token.json                 # Pathao cached tokens (auto-generated, DO NOT COMMIT)
├── sheets_config.json         # Sheet configuration (header rows, columns, roles)
│
├── static/
│   ├── index.html            # Main dashboard page
│   ├── login.html            # Login page
│   └── js/
│       └── app.js            # Frontend JavaScript
│
├── test.ipynb                # Jupyter notebook for testing
├── connect_sheet.py          # Google Sheets connection test
├── README.md                 # This file
└── .gitignore                # Excludes credentials, .env, token.json
```

---

## Prerequisites

- **Python 3.10+** installed
- **Google Cloud Project** with Sheets API and Drive API enabled
- **Google Service Account** with JSON credentials
- **Pathao Merchant Account** with API credentials
- **Steadfast Merchant Account** with API key and secret key
- **Google Spreadsheet** with these sheets:
  - `UserName` (for authentication)
  - `Sales` (main orders data)
  - `Sales Raw` (order insertion target)
  - `Inventory` (product data)

---

## Installation

### 1. Clone or download the project

```bash
cd "your/project/directory"
```

### 2. Install Python dependencies

```bash
pip install fastapi uvicorn gspread google-auth python-dotenv requests pandas pyjwt
```

Or with specific versions:

```bash
pip install fastapi==0.109.0 uvicorn==0.27.0 gspread==6.2.1 google-auth==2.48.0 python-dotenv==1.1.1 requests==2.32.4 pandas==2.3.0 pyjwt==2.8.0
```

---

## Configuration

### 1. Google Sheets Setup

#### Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to **IAM & Admin > Service Accounts**
5. Click **Create Service Account**
6. Name it (e.g., `sheet-accessor`)
7. Click **Create and Continue** (skip optional steps)
8. Go to the service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**
9. Download and rename to `credentials.json`
10. Place it in the project root

#### Share the Spreadsheet

1. Open your Google Spreadsheet
2. Click **Share** (top-right)
3. Add the service account email from `credentials.json` (`client_email` field)
   ```
   your-service-account@your-project.iam.gserviceaccount.com
   ```
4. Set role to **Editor**
5. Click **Send**

### 2. Pathao Courier Setup

1. Log in to [Pathao Merchant Panel](https://merchant.pathao.com/)
2. Go to **Developer API** settings
3. Note your **Client ID** and **Client Secret**
4. Your login **email** and **password** are also required

### 3. Steadfast Courier Setup

1. Log in to [Steadfast Portal](https://portal.packzy.com/)
2. Go to **API Settings**
3. Note your **API Key** and **Secret Key**

### 4. Environment Variables

Create `.env` file in project root:

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

# JWT Secret (generate a random 32+ character string)
JWT_SECRET_KEY=your-super-secret-jwt-key-here-change-this
```

### 5. Sheets Configuration

Create/edit [`sheets_config.json`](sheets_config.json):

```json
{
  "_comment": "Configuration for Google Sheets access",
  
  "Sales": {
    "header_row": 1,
    "columns": "A:R",
    "visible": true,
    "roles": ["admin", "moderator"],
    "role_columns": {
      "moderator": ["Order ID", "Date", "Customer Name", "Product ID", "Quantity", "Order Status"]
    },
    "image_columns": []
  },
  
  "Inventory": {
    "header_row": 1,
    "columns": null,
    "visible": true,
    "roles": ["admin"],
    "image_columns": ["Product Image"]
  },
  
  "Sales Raw": {
    "header_row": 1,
    "visible": true,
    "roles": ["admin"]
  }
}
```

**Configuration options:**
- `header_row`: Row number where headers start (default: 1)
- `columns`: Column range to read (e.g., `"A:R"` or `null` for all)
- `visible`: Show in sidebar (default: `true`)
- `roles`: List of roles that can access this sheet (`null` = all roles)
- `role_columns`: Column filters per role (only these columns shown to that role)
- `image_columns`: Columns to treat as image URLs (thumbnail + zoom)

### 6. User Management

Create a `UserName` sheet in your Google Spreadsheet with these columns:

| Username | Email | Password | Role | lastActive |
|---|---|---|---|---|
| Admin | admin@example.com | secure_password_123 | admin | 2026-01-15 10:30:00 |
| John | moderator@example.com | password456 | moderator | 2026-01-14 15:45:00 |

**Notes:**
- Passwords are stored **plain text** (for demo purposes only)
- `lastActive` is auto-updated on each login
- Role values: `admin` or `moderator`

---

## Usage

### Running the Application

Start the FastAPI server:

```bash
python main.py
```

Or with Uvicorn directly:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Access the application:**
- Dashboard: http://127.0.0.1:8000
- Login: http://127.0.0.1:8000/login
- API Docs: http://127.0.0.1:8000/docs

**Default workflow:**
1. Navigate to http://127.0.0.1:8000 → Redirects to login if not authenticated
2. Enter credentials from UserName sheet
3. Dashboard loads with accessible sheets in sidebar
4. Click sheet name to view data
5. (Admin only) Click "Update Order Statuses" to fetch delivery statuses
6. (Admin only, Sales Raw) Click "Insert Order" to add new orders

### Testing Components

**Test Google Sheets connection:**
```bash
python connect_sheet.py
```

**Test Pathao API standalone:**
```bash
python pathao_courier.py DA010226MAN7CG
```

**Test Steadfast API standalone:**
```bash
python steadfast_courier.py 123456
```

**Run standalone status update pipeline:**
```bash
python update_order_status.py
```

---

## API Reference

### Authentication

#### POST `/api/login`
Login and get JWT token.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "secure_password_123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "Admin",
  "email": "admin@example.com",
  "role": "admin"
}
```

#### GET `/api/me`
Get current user info from token.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "username": "Admin",
  "email": "admin@example.com",
  "role": "admin"
}
```

### Sheet Operations

#### GET `/api/sheets`
List sheets accessible to current user.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "sheets": [
    {
      "name": "Sales",
      "header_row": 1,
      "columns": "A:R"
    },
    {
      "name": "Inventory",
      "header_row": 1,
      "columns": null
    }
  ]
}
```

#### GET `/api/sheets/{sheet_name}`
Get data from a specific sheet.

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "headers": ["Order ID", "Date", "Customer Name", "Product ID", "Quantity"],
  "rows": [
    ["ORD#20260201-01478", "2/1/2026", "John Doe", "PRD-023", "1"],
    ["ORD#20260201-01481", "2/1/2026", "Jane Smith", "PRD-008", "1"]
  ],
  "config": {
    "header_row": 1,
    "columns": "A:R",
    "visible": true,
    "roles": ["admin", "moderator"]
  },
  "image_columns": ["Product Image"]
}
```

#### GET `/api/config`
Get full sheets configuration (admin only).

**Headers:** `Authorization: Bearer {token}`

### Order Management

#### GET `/api/products`
Get list of products from Inventory sheet (for dropdown).

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "products": [
    "Product Name 1",
    "Product Name 2",
    "Product Name 3"
  ]
}
```

#### POST `/api/sales-raw/insert`
Insert new order(s) to Sales Raw sheet.

**Headers:** 
- `Authorization: Bearer {token}`
- `Content-Type: application/json`

**Request:**
```json
{
  "date": "1-Feb-2026",
  "customer_name": "John Doe",
  "customer_contact": "01712345678",
  "customer_address": "123 Main St, Dhaka",
  "customer_type": "Regular",
  "products": [
    {
      "product_details": "Product Name 1",
      "quantity": 2
    },
    {
      "product_details": "Product Name 2",
      "quantity": 1
    }
  ]
}
```

**Response:**
```json
{
  "message": "Order inserted successfully! 2 row(s) added to Sales Raw.",
  "sl_no": 1234,
  "rows_added": 2
}
```

### Status Updates

#### POST `/api/update-statuses`
Update delivery statuses from courier APIs (admin only).

**Headers:** `Authorization: Bearer {token}`

**Response:**
```json
{
  "total_rows": 175,
  "with_consignment": 2,
  "updated": 2,
  "details": [
    {
      "order_id": "ORD#20260201-01478",
      "status": "Delivered",
      "row": 173
    },
    {
      "order_id": "ORD#20260201-01481",
      "status": "Delivered",
      "row": 176
    }
  ],
  "errors": []
}
```

---

## Role-Based Access Control

### Admin Role
- Access to **all sheets** defined in [`sheets_config.json`](sheets_config.json)
- See **all columns** in each sheet
- Can **insert orders** to Sales Raw
- Can **update delivery statuses**
- Can view full sheets configuration

### Moderator Role
- Access to sheets where `"roles": ["admin", "moderator"]` or `"roles": null`
- See only columns listed in `"role_columns": { "moderator": [...] }`
- **Cannot** insert orders
- **Cannot** update delivery statuses
- **Cannot** view sheets configuration

### Implementation
Role filtering happens in two places:
1. **Sheet list** ([`sheets_service.py`](sheets_service.py) → `get_sheets_for_role()`)
2. **Column filtering** ([`sheets_service.py`](sheets_service.py) → `filter_columns_for_role()`)

Frontend also hides UI elements (Insert Order, Update Statuses buttons) based on role stored in [`authUser`](static/js/app.js).

---

## Image Handling

### Configuration
List image columns in [`sheets_config.json`](sheets_config.json):

```json
{
  "Inventory": {
    "image_columns": ["Product Image", "Thumbnail"]
  }
}
```

### Supported Sources
- Direct URLs ending in `.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`
- Google Drive shared links
- Cloudinary CDN
- Imgur

### Formula Support
Extracts URLs from `=IMAGE("url")` formulas:
```
=IMAGE("https://example.com/image.jpg", 4, 50, 50)
```
→ Renders as: `https://example.com/image.jpg`

### Frontend Behavior
- Thumbnails: 50x50px in table cells
- Hover zoom: 320x380px popup follows cursor
- Lazy loading for performance

---

## Token Management (Pathao)

Pathao uses OAuth2 with access + refresh tokens. [`PathaoCourier`](pathao_courier.py) manages this automatically:

```
First run:
  No token.json → Full login → Save tokens

Subsequent runs:
  token.json exists → Token valid? → Use cached (0 API calls)
                   → Token expired? → Refresh token (1 API call)
                   → Refresh fails? → Full login (1 API call)

During API call:
  401 Unauthorized? → Auto-refresh → Retry once
```

**Token file:** [`token.json`](token.json) (auto-generated, expires ~90 days)

**Steadfast** uses static API Key + Secret Key (no token management needed).

---

## Error Handling

### Backend ([`main.py`](main.py))
| Error | HTTP Status | Response |
|---|---|---|
| Invalid credentials | 401 | `{"detail": "Invalid email or password"}` |
| Token expired/invalid | 401 | `{"detail": "Token expired or invalid. Please log in again."}` |
| No permission for sheet | 403 | `{"detail": "You don't have access to 'SheetName'"}` |
| Sheet not found | 404 | `{"detail": "Worksheet 'SheetName' not found."}` |
| Google Sheets API error | 502 | `{"detail": "Failed to access sheet: ..."}` |

### Frontend ([`app.js`](static/js/app.js))
- **401 responses** → Auto-logout and redirect to login
- **Network errors** → Toast notification with error message
- **Form validation** → Inline warnings before submission
- **Token verification** → Background check on page load, logout if invalid

### Courier APIs
See [pathao_courier.py](pathao_courier.py) and [steadfast_courier.py](steadfast_courier.py) for retry logic, timeout handling, and rate-limit detection.

---

## Security Notes

### Files to Keep Private

**NEVER commit these files to version control:**

| File | Contains |
|---|---|
| [`credentials.json`](credentials.json) | Google service account private key |
| [`.env`](.env) | Pathao & Steadfast API credentials + JWT secret |
| [`token.json`](token.json) | Pathao access & refresh tokens |

Add to `.gitignore`:
```gitignore
credentials.json
.env
token.json
__pycache__/
*.pyc
```

### Best Practices
- Use strong JWT secret (32+ random characters)
- Store passwords hashed (current implementation uses plain text for demo)
- Use HTTPS in production
- Set short JWT expiration times (e.g., 1 hour)
- Implement refresh token rotation
- Add rate limiting to login endpoint
- Use environment-specific `.env` files (`.env.dev`, `.env.prod`)

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `SpreadsheetNotFound` | Share the spreadsheet with service account email from [`credentials.json`](credentials.json) (`client_email` field) |
| `Worksheet 'SheetName' not found` | Check exact sheet name spelling in [`sheets_config.json`](sheets_config.json) |
| `401 Unauthorized` after login | Verify JWT_SECRET_KEY matches between server restarts |
| `Missing required env variable(s)` | Check [`.env`](.env) file has all required keys (no quotes needed) |
| `Pathao login failed (401)` | Verify PATHAO_EMAIL and PATHAO_PASSWORD in [`.env`](.env) |
| `Steadfast auth failed (401)` | Verify STEADFAST_API_KEY and STEADFAST_SECRET_KEY in [`.env`](.env) |
| `Google API rate limit` | Wait 1-2 minutes; quota is 60 requests/minute |
| `token.json is malformed` | Delete [`token.json`](token.json) and restart server |
| Images not showing | Check `image_columns` in [`sheets_config.json`](sheets_config.json), verify URLs are publicly accessible |
| DataTable not rendering | Check browser console for JavaScript errors, ensure jQuery is loaded |
| Insert Order button hidden | Only visible on Sales Raw sheet for admin users |
| Update Statuses button hidden | Only visible to admin users |

---

## License

This project is for internal use. Modify and distribute as needed within your organization.

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review API documentation links in [Tech Stack](#tech-stack)
3. Check browser console (F12) for frontend errors
4. Check server logs for backend errors

---

**Last Updated:** January 2026  
**Version:** 2.0 (Web Dashboard Release)
