
-- =========================
-- INSERT DATA
-- =========================

-- accounts
INSERT INTO accounts (accountID, firstName, lastName, dateCreated)
VALUES
(13, 'test', 'user', '2026-01-08');

-- users
INSERT INTO users (username, email, password, firstName, lastName, accountID, level, age)
VALUES
('testUser', 'test@domain.com', 'admin', 'test', 'user', 13, 'M', 'O');

-- deposits
INSERT INTO deposits (depositID, depositDate, depositAmount, hoursWorked, notes, accountID, startBalance, endBalance)
VALUES
(36, '2026-01-01', 520,   37, NULL, 13, 1100,  937.64),
(37, '2026-01-15', 460.9, 30, NULL, 13, 937.64, 1171.05),
(38, '2026-01-29', 500,   33, NULL, 13, 1500,  1900);

-- withdrawals
-- NOTE: because withdrawalID has a default sequence, you *could* omit it,
-- but you already have IDs 1..15, so we insert them explicitly to match your data.
INSERT INTO withdrawals
(withdrawalID, depositID, category, subcategory, withdrawalDate, location, cost, notes, onlineFlag, accountID)
VALUES
(1,  36, 'Groceries', 'Sam''s Club',        '2026-01-02', 'Provo, UT', 120.00, NULL, false, 13),
(2,  36, 'Gas',       'Chevron',           '2026-01-02', 'Provo, UT', 28.30,  NULL, false, 13),
(3,  36, 'Dining',    'Cafe Rio',          '2026-01-05', 'Provo, UT', 13.23,  NULL, false, 13),
(4,  36, 'Dining',    'Olive Garden',      '2026-01-06', 'Provo, UT', 20.23,  NULL, false, 13),
(5,  36, 'Rent',      'Apartment Complex', '2026-01-02', 'Provo, UT', 480.20, NULL, true,  13),
(6,  37, 'Groceries', 'Sam''s Club',        '2026-01-16', 'Provo, UT', 109.23, NULL, false, 13),
(7,  37, 'Dining',    'Sam''s Club',        '2026-01-16', 'Provo, UT', 3.23,   NULL, false, 13),
(8,  37, 'Personal Expense', 'Ross',       '2026-01-17', 'Provo, UT', 48.90,  NULL, false, 13),
(9,  37, 'Dining',    'Cafe Rio',          '2026-01-19', 'Orem, UT',  12.45,  NULL, false, 13),
(10, 36, 'Subscription', 'Amazon',         '2026-01-09', 'Online',    20.40,  NULL, true,  13),
(11, 37, 'Subscription', 'Open AI',        '2026-01-16', 'Online',    20.00,  NULL, true,  13),
(12, 37, 'Misc.',     'Chevron',           '2026-01-20', 'Provo, UT', 3.23,   NULL, false, 13),
(13, 37, 'Gas',       'Sam''s Club',        '2026-01-20', 'Provo, UT', 30.45,  NULL, false, 13),
(14, 38, 'Groceries', 'Sam''s Club',        '2026-01-30', 'Provo, UT', 50.00,  NULL, false, 13),
(15, 38, 'Groceries', 'Walmart',           '2026-01-31', 'Provo, UT', 50.00,  NULL, false, 13);

-- =========================
-- IMPORTANT: bump the sequence so future inserts don't collide
-- =========================
SELECT setval('withdrawals_withdrawalid_seq', (SELECT MAX(withdrawalID) FROM withdrawals));
