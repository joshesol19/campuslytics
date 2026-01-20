-- =========================
-- RESET
-- =========================
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS deposits;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS accounts;

-- Also drop the exact sequence name shown in pgAdmin
DROP SEQUENCE IF EXISTS withdrawals_withdrawalid_seq;

-- =========================
-- ACCOUNTS
-- =========================
CREATE TABLE accounts (
  accountID      BIGINT PRIMARY KEY,
  firstName      VARCHAR(20) NOT NULL,
  lastName       VARCHAR(25) NOT NULL,
  dateCreated    DATE
);

-- =========================
-- DEPOSITS
-- =========================
CREATE TABLE deposits (
  depositID      BIGINT PRIMARY KEY,
  depositDate    DATE NOT NULL,
  depositAmount  DOUBLE PRECISION NOT NULL,
  hoursWorked    DOUBLE PRECISION,
  notes          VARCHAR(600),
  accountID      BIGINT NOT NULL,
  startBalance   DOUBLE PRECISION,
  endBalance     DOUBLE PRECISION
);

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
  username  VARCHAR(20) PRIMARY KEY,
  email     VARCHAR(70) NOT NULL,
  password  VARCHAR(70) NOT NULL,
  firstName VARCHAR(25) NOT NULL,
  lastName  VARCHAR(35),
  accountID BIGINT NOT NULL,
  level     CHAR(1) NOT NULL DEFAULT 'M'::bpchar,
  age       CHAR(1) NOT NULL DEFAULT 'N'::bpchar
);

-- =========================
-- WITHDRAWALS
-- =========================

-- Create the sequence explicitly so the default matches *exactly*
CREATE SEQUENCE withdrawals_withdrawalid_seq;

CREATE TABLE withdrawals (
  withdrawalID   INTEGER NOT NULL DEFAULT nextval('withdrawals_withdrawalid_seq'::regclass),
  depositID      INTEGER NOT NULL,
  category       VARCHAR(50) NOT NULL,
  subcategory    VARCHAR(50),
  withdrawalDate DATE NOT NULL,
  location       VARCHAR(100),
  cost           NUMERIC(10,2) NOT NULL,
  notes          TEXT,
  onlineFlag     BOOLEAN NOT NULL DEFAULT false,
  accountID      INTEGER NOT NULL,
  CONSTRAINT withdrawals_pkey PRIMARY KEY (withdrawalID)
);