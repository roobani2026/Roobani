"""Roobani Admin Panel Phase 1 Backend Tests

Tests all admin panel endpoints:
- Admin auth (login/logout/me) with separate admin_session_token cookie
- Admin user CRUD (Access 0 only, with caps)
- Customer list/detail/patch (scoped: Access 1 sees only assigned)
- Customer assignment (Access 0 only)
- Holding adjustment endpoint
- Withdrawal request + approval flow
- Site settings + public maintenance banner
- Audit log
- Admin dashboard overview
"""
import os
import uuid
import requests

# Backend URL from environment
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://roobani-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Test credentials from /app/memory/test_credentials.md
SUPER_ADMIN_EMAIL = "admin@roobani.com"
SUPER_ADMIN_PASSWORD = "Admin@Roobani2026!"

# Test data
TEST_MANAGER_EMAIL = f"manager_{uuid.uuid4().hex[:8]}@roobani.com"
TEST_MANAGER_PASSWORD = "Manager@Test2026!"
TEST_MANAGER_NAME = "Test Account Manager"

TEST_CUSTOMER_EMAIL = f"customer_{uuid.uuid4().hex[:8]}@roobani.dev"
TEST_CUSTOMER_PASSWORD = "Customer@Test2026!"
TEST_CUSTOMER_NAME = "Test Customer User"


def print_test(name):
    """Print test name for visibility"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)


def print_result(passed, message=""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")


def test_1_admin_login():
    """Test 1: POST /api/admin/auth/login with seeded super admin credentials"""
    print_test("1. Admin Login with Super Admin Credentials")
    
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    
    if r.status_code != 200:
        print_result(False, f"Login failed: {r.status_code} {r.text}")
        return None, None
    
    data = r.json()
    if "admin" not in data:
        print_result(False, f"Response missing 'admin' field: {data}")
        return None, None
    
    # Check for admin_session_token cookie
    admin_cookie = s.cookies.get("admin_session_token")
    if not admin_cookie:
        print_result(False, "admin_session_token cookie not set")
        return None, None
    
    admin_id = data["admin"]["admin_id"]
    print_result(True, f"Super admin logged in successfully. admin_id={admin_id}, cookie set")
    return s, admin_id


def test_2_admin_me(session):
    """Test 2: GET /api/admin/auth/me with admin_session_token cookie"""
    print_test("2. Admin /auth/me with Cookie")
    
    if not session:
        print_result(False, "No session from previous test")
        return False
    
    r = session.get(f"{API}/admin/auth/me")
    
    if r.status_code != 200:
        print_result(False, f"GET /admin/auth/me failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if data.get("access_level") != 0:
        print_result(False, f"Expected access_level=0, got {data.get('access_level')}")
        return False
    
    print_result(True, f"Admin /me works. access_level=0, email={data.get('email')}")
    return True


def test_3_admin_lockout():
    """Test 3: Lockout after 5 failed login attempts"""
    print_test("3. Admin Lockout After 5 Failed Attempts")
    
    # Create a test admin first to avoid locking the super admin
    super_session, _ = test_1_admin_login()
    if not super_session:
        print_result(False, "Cannot create test admin - super admin login failed")
        return False
    
    test_email = f"locktest_{uuid.uuid4().hex[:8]}@roobani.com"
    r = super_session.post(f"{API}/admin/admins", json={
        "full_name": "Lockout Test Admin",
        "email": test_email,
        "password": "LockTest@2026!",
        "access_level": 1
    })
    
    if r.status_code != 201:
        print_result(False, f"Failed to create test admin: {r.status_code} {r.text}")
        return False
    
    # Try 5 wrong passwords
    for i in range(5):
        r = requests.post(f"{API}/admin/auth/login", json={
            "email": test_email,
            "password": "WrongPassword123!"
        })
        if r.status_code != 401:
            print_result(False, f"Attempt {i+1}: Expected 401, got {r.status_code}")
            return False
    
    # 6th attempt should be locked (423)
    r = requests.post(f"{API}/admin/auth/login", json={
        "email": test_email,
        "password": "LockTest@2026!"  # Even with correct password
    })
    
    if r.status_code != 423:
        print_result(False, f"Expected 423 (locked), got {r.status_code} {r.text}")
        return False
    
    print_result(True, "Account locked after 5 failed attempts (423 status)")
    return True


def test_4_create_manager(super_session):
    """Test 4: POST /api/admin/admins to create Access 1 manager"""
    print_test("4. Create Access 1 Manager")
    
    if not super_session:
        print_result(False, "No super admin session")
        return None
    
    r = super_session.post(f"{API}/admin/admins", json={
        "full_name": TEST_MANAGER_NAME,
        "email": TEST_MANAGER_EMAIL,
        "password": TEST_MANAGER_PASSWORD,
        "access_level": 1
    })
    
    if r.status_code != 201:
        print_result(False, f"Failed to create manager: {r.status_code} {r.text}")
        return None
    
    data = r.json()
    manager_id = data.get("admin_id")
    
    if data.get("access_level") != 1:
        print_result(False, f"Expected access_level=1, got {data.get('access_level')}")
        return None
    
    print_result(True, f"Manager created successfully. admin_id={manager_id}")
    return manager_id


def test_5_duplicate_admin_email(super_session):
    """Test 5: POST /api/admin/admins with duplicate email returns 409"""
    print_test("5. Duplicate Admin Email Returns 409")
    
    if not super_session:
        print_result(False, "No super admin session")
        return False
    
    r = super_session.post(f"{API}/admin/admins", json={
        "full_name": "Duplicate Manager",
        "email": TEST_MANAGER_EMAIL,  # Same as test 4
        "password": "Duplicate@2026!",
        "access_level": 1
    })
    
    if r.status_code != 409:
        print_result(False, f"Expected 409, got {r.status_code} {r.text}")
        return False
    
    print_result(True, "Duplicate email correctly rejected with 409")
    return True


def test_6_manager_login_and_permissions():
    """Test 6: Login as Access 1 manager and verify limited permissions"""
    print_test("6. Manager Login and Permission Checks")
    
    # Login as manager
    manager_session = requests.Session()
    r = manager_session.post(f"{API}/admin/auth/login", json={
        "email": TEST_MANAGER_EMAIL,
        "password": TEST_MANAGER_PASSWORD
    })
    
    if r.status_code != 200:
        print_result(False, f"Manager login failed: {r.status_code} {r.text}")
        return None
    
    # Check /admin/auth/me
    r = manager_session.get(f"{API}/admin/auth/me")
    if r.status_code != 200:
        print_result(False, f"Manager /auth/me failed: {r.status_code}")
        return None
    
    data = r.json()
    if data.get("access_level") != 1:
        print_result(False, f"Expected access_level=1, got {data.get('access_level')}")
        return None
    
    # Try to access /admin/admins (should be 403)
    r = manager_session.get(f"{API}/admin/admins")
    if r.status_code != 403:
        print_result(False, f"Manager should not access /admin/admins. Expected 403, got {r.status_code}")
        return None
    
    # Try to access /admin/audit (should be 403)
    r = manager_session.get(f"{API}/admin/audit")
    if r.status_code != 403:
        print_result(False, f"Manager should not access /admin/audit. Expected 403, got {r.status_code}")
        return None
    
    print_result(True, "Manager login works, access_level=1, /admin/admins and /admin/audit correctly return 403")
    return manager_session


def test_7_create_customer():
    """Test 7: Create a customer via POST /api/auth/register"""
    print_test("7. Create Customer Account")
    
    customer_session = requests.Session()
    r = customer_session.post(f"{API}/auth/register", json={
        "full_name": TEST_CUSTOMER_NAME,
        "email": TEST_CUSTOMER_EMAIL,
        "password": TEST_CUSTOMER_PASSWORD,
        "consent": True
    })
    
    if r.status_code != 201:
        print_result(False, f"Customer registration failed: {r.status_code} {r.text}")
        return None, None
    
    # Get user_id from /auth/me
    r = customer_session.get(f"{API}/auth/me")
    if r.status_code != 200:
        print_result(False, f"Customer /auth/me failed: {r.status_code}")
        return None, None
    
    data = r.json()
    user_id = data.get("user_id")
    
    print_result(True, f"Customer created. user_id={user_id}, email={TEST_CUSTOMER_EMAIL}")
    return user_id, customer_session


def test_8_assign_customer(super_session, manager_id, customer_user_id):
    """Test 8: Assign customer to manager"""
    print_test("8. Assign Customer to Manager")
    
    if not super_session or not manager_id or not customer_user_id:
        print_result(False, "Missing required data from previous tests")
        return False
    
    r = super_session.post(f"{API}/admin/customers/{customer_user_id}/assign", json={
        "manager_admin_id": manager_id
    })
    
    if r.status_code != 200:
        print_result(False, f"Assignment failed: {r.status_code} {r.text}")
        return False
    
    print_result(True, f"Customer {customer_user_id} assigned to manager {manager_id}")
    return True


def test_9_manager_sees_assigned_customers(manager_session, customer_user_id):
    """Test 9: Manager can see assigned customers"""
    print_test("9. Manager Sees Only Assigned Customers")
    
    if not manager_session or not customer_user_id:
        print_result(False, "Missing required data from previous tests")
        return False
    
    r = manager_session.get(f"{API}/admin/customers")
    
    if r.status_code != 200:
        print_result(False, f"GET /admin/customers failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    scope = data.get("scope")
    
    if scope != "assigned":
        print_result(False, f"Expected scope='assigned', got '{scope}'")
        return False
    
    # Check if assigned customer is in the list
    customer_ids = [item.get("user_id") for item in items]
    if customer_user_id not in customer_ids:
        print_result(False, f"Assigned customer {customer_user_id} not in list")
        return False
    
    print_result(True, f"Manager sees assigned customer. scope='assigned', {len(items)} customer(s)")
    return True


def test_10_manager_patch_assigned_customer(manager_session, customer_user_id):
    """Test 10: Manager can PATCH assigned customer"""
    print_test("10. Manager Can PATCH Assigned Customer")
    
    if not manager_session or not customer_user_id:
        print_result(False, "Missing required data from previous tests")
        return False
    
    r = manager_session.patch(f"{API}/admin/customers/{customer_user_id}", json={
        "kyc_status": "verified",
        "notes": "Test note from manager"
    })
    
    if r.status_code != 200:
        print_result(False, f"PATCH failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if data.get("kyc_status") != "verified":
        print_result(False, f"kyc_status not updated: {data.get('kyc_status')}")
        return False
    
    print_result(True, "Manager successfully updated assigned customer (kyc_status=verified)")
    return True


def test_11_manager_cannot_patch_unassigned(manager_session):
    """Test 11: Manager cannot PATCH unassigned customer"""
    print_test("11. Manager Cannot PATCH Unassigned Customer")
    
    if not manager_session:
        print_result(False, "No manager session")
        return False
    
    # Create another customer that is NOT assigned to this manager
    unassigned_session = requests.Session()
    r = unassigned_session.post(f"{API}/auth/register", json={
        "full_name": "Unassigned Customer",
        "email": f"unassigned_{uuid.uuid4().hex[:8]}@roobani.dev",
        "password": "Unassigned@2026!",
        "consent": True
    })
    
    if r.status_code != 201:
        print_result(False, f"Failed to create unassigned customer: {r.status_code}")
        return False
    
    r = unassigned_session.get(f"{API}/auth/me")
    unassigned_user_id = r.json().get("user_id")
    
    # Try to PATCH as manager (should be 403)
    r = manager_session.patch(f"{API}/admin/customers/{unassigned_user_id}", json={
        "kyc_status": "verified"
    })
    
    if r.status_code != 403:
        print_result(False, f"Expected 403, got {r.status_code} {r.text}")
        return False
    
    print_result(True, "Manager correctly denied access to unassigned customer (403)")
    return True


def test_12_manager_create_withdrawal(manager_session, customer_user_id):
    """Test 12: Manager creates withdrawal (status=pending)"""
    print_test("12. Manager Creates Withdrawal Request (Pending)")
    
    if not manager_session or not customer_user_id:
        print_result(False, "Missing required data from previous tests")
        return None
    
    r = manager_session.post(f"{API}/admin/withdrawals", json={
        "customer_user_id": customer_user_id,
        "amount": 100.0,
        "reason": "Test withdrawal for investment",
        "bank_beneficiary": "Test Bank Account"
    })
    
    if r.status_code != 201:
        print_result(False, f"Withdrawal creation failed: {r.status_code} {r.text}")
        return None
    
    data = r.json()
    withdrawal_id = data.get("withdrawal_id")
    status = data.get("status")
    
    if status != "pending":
        print_result(False, f"Expected status='pending', got '{status}'")
        return None
    
    print_result(True, f"Withdrawal created with status='pending'. withdrawal_id={withdrawal_id}")
    return withdrawal_id


def test_13_withdrawal_scoping(super_session, manager_session):
    """Test 13: Withdrawal list scoping (manager sees own, super sees all)"""
    print_test("13. Withdrawal List Scoping")
    
    if not super_session or not manager_session:
        print_result(False, "Missing required sessions")
        return False
    
    # Manager sees only their own
    r = manager_session.get(f"{API}/admin/withdrawals")
    if r.status_code != 200:
        print_result(False, f"Manager GET /admin/withdrawals failed: {r.status_code}")
        return False
    
    manager_data = r.json()
    manager_items = manager_data.get("items", [])
    
    # Super admin sees all
    r = super_session.get(f"{API}/admin/withdrawals")
    if r.status_code != 200:
        print_result(False, f"Super admin GET /admin/withdrawals failed: {r.status_code}")
        return False
    
    super_data = r.json()
    super_items = super_data.get("items", [])
    
    # Super admin should see at least as many as manager
    if len(super_items) < len(manager_items):
        print_result(False, f"Super admin sees fewer withdrawals ({len(super_items)}) than manager ({len(manager_items)})")
        return False
    
    print_result(True, f"Scoping works: Manager sees {len(manager_items)}, Super admin sees {len(super_items)}")
    return True


def test_14_super_approve_withdrawal(super_session, withdrawal_id):
    """Test 14: Super admin approves withdrawal"""
    print_test("14. Super Admin Approves Withdrawal")
    
    if not super_session or not withdrawal_id:
        print_result(False, "Missing required data from previous tests")
        return False
    
    # Approve the withdrawal
    r = super_session.post(f"{API}/admin/withdrawals/{withdrawal_id}/decide", json={
        "approve": True,
        "note": "Approved for testing"
    })
    
    if r.status_code != 200:
        print_result(False, f"Approval failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if data.get("status") != "approved":
        print_result(False, f"Expected status='approved', got '{data.get('status')}'")
        return False
    
    # Try to approve again (should be 400)
    r = super_session.post(f"{API}/admin/withdrawals/{withdrawal_id}/decide", json={
        "approve": True,
        "note": "Second approval attempt"
    })
    
    if r.status_code != 400:
        print_result(False, f"Expected 400 on second approval, got {r.status_code}")
        return False
    
    print_result(True, "Withdrawal approved successfully, second approval correctly rejected (400)")
    return True


def test_15_super_update_settings(super_session):
    """Test 15: Super admin updates site settings"""
    print_test("15. Super Admin Updates Site Settings")
    
    if not super_session:
        print_result(False, "No super admin session")
        return False
    
    r = super_session.patch(f"{API}/admin/settings", json={
        "maintenance_mode": True,
        "maintenance_message": "Test maintenance mode"
    })
    
    if r.status_code != 200:
        print_result(False, f"Settings update failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if not data.get("maintenance_mode"):
        print_result(False, f"maintenance_mode not set to True: {data}")
        return False
    
    print_result(True, "Site settings updated: maintenance_mode=True")
    return True


def test_16_public_settings():
    """Test 16: GET /api/public/settings (no auth)"""
    print_test("16. Public Settings Endpoint (No Auth)")
    
    r = requests.get(f"{API}/public/settings")
    
    if r.status_code != 200:
        print_result(False, f"GET /public/settings failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if not data.get("maintenance_mode"):
        print_result(False, f"Expected maintenance_mode=True, got {data.get('maintenance_mode')}")
        return False
    
    if not data.get("maintenance_message"):
        print_result(False, "maintenance_message is empty")
        return False
    
    print_result(True, f"Public settings correct: maintenance_mode=True, message='{data.get('maintenance_message')}'")
    return True


def test_17_manager_cannot_update_settings(manager_session):
    """Test 17: Manager cannot update settings (403)"""
    print_test("17. Manager Cannot Update Settings")
    
    if not manager_session:
        print_result(False, "No manager session")
        return False
    
    r = manager_session.patch(f"{API}/admin/settings", json={
        "maintenance_mode": False
    })
    
    if r.status_code != 403:
        print_result(False, f"Expected 403, got {r.status_code} {r.text}")
        return False
    
    print_result(True, "Manager correctly denied access to settings (403)")
    return True


def test_18_dashboard_super(super_session):
    """Test 18: GET /api/admin/dashboard as super admin"""
    print_test("18. Dashboard for Super Admin")
    
    if not super_session:
        print_result(False, "No super admin session")
        return False
    
    r = super_session.get(f"{API}/admin/dashboard")
    
    if r.status_code != 200:
        print_result(False, f"Dashboard failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if not data.get("is_super"):
        print_result(False, f"Expected is_super=True, got {data.get('is_super')}")
        return False
    
    metrics = data.get("metrics", {})
    required_keys = ["users", "leads", "contacts", "holdings", "managers", "super_admins", "total_invested", "pending_withdrawals"]
    missing = [k for k in required_keys if k not in metrics]
    
    if missing:
        print_result(False, f"Missing metrics keys: {missing}")
        return False
    
    print_result(True, f"Super admin dashboard: is_super=True, metrics={list(metrics.keys())}")
    return True


def test_19_dashboard_manager(manager_session):
    """Test 19: GET /api/admin/dashboard as manager"""
    print_test("19. Dashboard for Manager")
    
    if not manager_session:
        print_result(False, "No manager session")
        return False
    
    r = manager_session.get(f"{API}/admin/dashboard")
    
    if r.status_code != 200:
        print_result(False, f"Dashboard failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    if data.get("is_super"):
        print_result(False, f"Expected is_super=False, got {data.get('is_super')}")
        return False
    
    metrics = data.get("metrics", {})
    required_keys = ["my_customers", "total_aum", "pending_withdrawals"]
    missing = [k for k in required_keys if k not in metrics]
    
    if missing:
        print_result(False, f"Missing metrics keys: {missing}")
        return False
    
    print_result(True, f"Manager dashboard: is_super=False, metrics={list(metrics.keys())}")
    return True


def test_20_audit_log(super_session):
    """Test 20: GET /api/admin/audit (Access 0 only)"""
    print_test("20. Audit Log")
    
    if not super_session:
        print_result(False, "No super admin session")
        return False
    
    r = super_session.get(f"{API}/admin/audit")
    
    if r.status_code != 200:
        print_result(False, f"Audit log failed: {r.status_code} {r.text}")
        return False
    
    data = r.json()
    items = data.get("items", [])
    
    if not items:
        print_result(False, "Audit log is empty (expected entries from previous tests)")
        return False
    
    # Check structure of first item
    first = items[0]
    required_keys = ["audit_id", "admin_id", "action", "created_at", "admin"]
    missing = [k for k in required_keys if k not in first]
    
    if missing:
        print_result(False, f"Audit entry missing keys: {missing}")
        return False
    
    print_result(True, f"Audit log contains {len(items)} entries with correct structure")
    return True


def test_21_access_0_cap(super_session):
    """Test 21: Access 0 cap enforcement (max 5)"""
    print_test("21. Access 0 Cap Enforcement (Max 5)")
    
    if not super_session:
        print_result(False, "No super admin session")
        return False
    
    # Get current count of Access 0 admins
    r = super_session.get(f"{API}/admin/admins")
    if r.status_code != 200:
        print_result(False, f"Failed to get admin list: {r.status_code}")
        return False
    
    data = r.json()
    current_a0_count = data.get("counts", {}).get("access_0", 0)
    cap = data.get("caps", {}).get("access_0", 5)
    
    print(f"Current Access 0 count: {current_a0_count}/{cap}")
    
    # Try to create Access 0 admins until we hit the cap
    created = []
    for i in range(cap - current_a0_count + 1):  # Try to create one more than allowed
        email = f"super_{uuid.uuid4().hex[:8]}@roobani.com"
        r = super_session.post(f"{API}/admin/admins", json={
            "full_name": f"Test Super Admin {i}",
            "email": email,
            "password": "TestSuper@2026!",
            "access_level": 0
        })
        
        if i < (cap - current_a0_count):
            # Should succeed
            if r.status_code != 201:
                print_result(False, f"Failed to create Access 0 admin {i+1}: {r.status_code} {r.text}")
                return False
            created.append(r.json().get("admin_id"))
        else:
            # Should fail with 400 (cap reached)
            if r.status_code != 400:
                print_result(False, f"Expected 400 (cap reached), got {r.status_code} {r.text}")
                return False
            if "cap" not in r.text.lower():
                print_result(False, f"Error message should mention 'cap': {r.text}")
                return False
    
    print_result(True, f"Access 0 cap enforced: created {len(created)}, then got 400 on exceeding cap")
    return True


def run_all_tests():
    """Run all admin panel tests in sequence"""
    print("\n" + "="*80)
    print("ROOBANI ADMIN PANEL PHASE 1 - BACKEND TESTS")
    print("="*80)
    
    results = {}
    
    # Test 1: Super admin login
    super_session, super_admin_id = test_1_admin_login()
    results["1_admin_login"] = super_session is not None
    
    # Test 2: Admin /me
    results["2_admin_me"] = test_2_admin_me(super_session)
    
    # Test 3: Lockout
    results["3_admin_lockout"] = test_3_admin_lockout()
    
    # Test 4: Create manager
    manager_id = test_4_create_manager(super_session)
    results["4_create_manager"] = manager_id is not None
    
    # Test 5: Duplicate email
    results["5_duplicate_email"] = test_5_duplicate_admin_email(super_session)
    
    # Test 6: Manager login and permissions
    manager_session = test_6_manager_login_and_permissions()
    results["6_manager_permissions"] = manager_session is not None
    
    # Test 7: Create customer
    customer_user_id, customer_session = test_7_create_customer()
    results["7_create_customer"] = customer_user_id is not None
    
    # Test 8: Assign customer
    results["8_assign_customer"] = test_8_assign_customer(super_session, manager_id, customer_user_id)
    
    # Test 9: Manager sees assigned customers
    results["9_manager_sees_assigned"] = test_9_manager_sees_assigned_customers(manager_session, customer_user_id)
    
    # Test 10: Manager PATCH assigned customer
    results["10_manager_patch_assigned"] = test_10_manager_patch_assigned_customer(manager_session, customer_user_id)
    
    # Test 11: Manager cannot PATCH unassigned
    results["11_manager_cannot_patch_unassigned"] = test_11_manager_cannot_patch_unassigned(manager_session)
    
    # Test 12: Manager creates withdrawal
    withdrawal_id = test_12_manager_create_withdrawal(manager_session, customer_user_id)
    results["12_manager_create_withdrawal"] = withdrawal_id is not None
    
    # Test 13: Withdrawal scoping
    results["13_withdrawal_scoping"] = test_13_withdrawal_scoping(super_session, manager_session)
    
    # Test 14: Super admin approves withdrawal
    results["14_super_approve_withdrawal"] = test_14_super_approve_withdrawal(super_session, withdrawal_id)
    
    # Test 15: Super admin updates settings
    results["15_super_update_settings"] = test_15_super_update_settings(super_session)
    
    # Test 16: Public settings
    results["16_public_settings"] = test_16_public_settings()
    
    # Test 17: Manager cannot update settings
    results["17_manager_cannot_update_settings"] = test_17_manager_cannot_update_settings(manager_session)
    
    # Test 18: Dashboard super
    results["18_dashboard_super"] = test_18_dashboard_super(super_session)
    
    # Test 19: Dashboard manager
    results["19_dashboard_manager"] = test_19_dashboard_manager(manager_session)
    
    # Test 20: Audit log
    results["20_audit_log"] = test_20_audit_log(super_session)
    
    # Test 21: Access 0 cap
    results["21_access_0_cap"] = test_21_access_0_cap(super_session)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    return results


if __name__ == "__main__":
    run_all_tests()
