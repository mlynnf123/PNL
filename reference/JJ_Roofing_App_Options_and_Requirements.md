# JJ Roofing Financial Application: What “Google-Based Operational App” Means

**Prepared by:** Manus AI  
**Purpose:** Explain the Google-based option, translate the clarified business rules, and recommend the appropriate implementation direction.

## Direct answer

By a **Google-based operational app**, I meant an application built with **Google AppSheet**. Employees would use an actual signed-in web and mobile interface with forms, job screens, approval buttons, dashboards, and role-based views. They would not work directly inside the current spreadsheet.

AppSheet is Google’s no-code application platform. It can build web and mobile applications from Google Sheets, AppSheet databases, Cloud SQL, and other structured sources. It supports interface views, calculations, workflow rules, and automations.[1]

> In practical terms, AppSheet would put an app interface in front of a properly structured database. Google Sheets could be removed from day-to-day use—or avoided entirely.

## How the Google-based option would be implemented

The existing worksheet would first be restructured into connected tables. A separate AppSheet application would then be configured over those tables.

| Layer              | JJ Roofing implementation                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Data source**    | Preferably an AppSheet Database or Cloud SQL database rather than one large Google Sheet                 |
| **Application**    | AppSheet web and mobile screens for jobs, collections, costs, commissions, draws, approvals, and reports |
| **Authentication** | Required sign-in for owners and any future reps                                                          |
| **Permissions**    | Owners can edit and approve; reps can optionally see only their own jobs and commission records          |
| **Workflow**       | Status gates prevent commission approval until the job, costs, and collections are final                 |
| **Automation**     | Reminders for missing final costs, uncollected depreciation, commission-ready jobs, and unpaid balances  |
| **Audit**          | Automatic updated-by/updated-at fields plus a permanent custom audit-event table                         |

AppSheet supports authentication, application access control, data access control, and monitoring of application activity.[2] Its automations can react to data changes, run approval processes, send notifications, and connect with APIs or webhooks.[3]

### Important audit limitation

AppSheet’s built-in Audit History records recent adds, updates, deletes, automation activity, and the signed-in user. However, Google states that its native retention is **7 days for most account types and 53 days for Enterprise Plus**.[4] That is not sufficient by itself for JJ Roofing’s financial audit requirements.

A proper AppSheet implementation would therefore create a permanent **Audit Events** table containing:

| Audit field    | Example                    |
| -------------- | -------------------------- |
| Record         | Job `JJ-2026-0041`         |
| Field changed  | Final Material Cost        |
| Previous value | $8,460.22                  |
| New value      | $8,112.09                  |
| Changed by     | Owner’s signed-in account  |
| Changed at     | Date and time              |
| Reason         | Final vendor return posted |
| Approval state | Reopened and reapproved    |

## How your clarified workflow should operate

Your explanation establishes two independent requirements before commission becomes payable:

> **The job must be complete and financially finalized, and all money must have been collected.**

For insurance jobs, this includes collection of the final depreciation check. For non-insurance jobs, it means the complete customer balance has been collected.

### Proposed job lifecycle

| Stage                    | Required condition                                                     | System behavior                                           |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| **Contracted**           | Signed contract exists                                                 | Store original contract and expected total revenue        |
| **In Production**        | Work has started                                                       | Costs may be entered as estimates or transactions         |
| **Job Complete**         | Completion has been confirmed                                          | Begin final cost reconciliation                           |
| **Costs Pending**        | Returns, extra purchases, or labor charges remain unresolved           | Profit is provisional; commission cannot be approved      |
| **Costs Final**          | Labor and material totals have been reconciled and approved            | Lock final cost values                                    |
| **Depreciation Pending** | Insurance job is complete but final insurance funds remain outstanding | Track COC submission and expected depreciation collection |
| **Fully Collected**      | All expected revenue has been received                                 | Collection requirement is satisfied                       |
| **Commission Ready**     | Job complete, costs final, and fully collected                         | Generate proposed commission allocations                  |
| **Commission Approved**  | Owner has reviewed the calculation                                     | Commission becomes payable                                |
| **Partially Paid**       | Draws or partial payments exist                                        | Display remaining balance by rep and job                  |
| **Paid / Closed**        | Approved commission balance is zero                                    | Lock the job unless an owner reopens it with a reason     |

### Insurance-specific revenue tracking

The application should not store all insurance money in one “Payout/Contract” field. It should preserve the components that explain the final revenue.

| Revenue field or transaction | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| Original signed contract     | Starting expected revenue                                  |
| Approved supplements         | Increases to expected revenue                              |
| Customer deductible          | Amount due from the customer                               |
| Initial insurance payment    | First carrier payment                                      |
| Supplemental payments        | Additional carrier payments                                |
| Recoverable depreciation     | Final insurance amount expected after completion documents |
| Customer payments            | Any amounts paid directly by the insured                   |
| Total expected revenue       | Contract plus approved changes                             |
| Total collected              | Sum of actual collection transactions                      |
| Remaining to collect         | Expected revenue minus collected revenue                   |

The system would automatically prevent the commission from becoming “Ready” while **Remaining to Collect** is greater than zero.

## Final labor and material cost tracking

Instead of typing one final material number manually, the application should record each cost transaction. This handles purchases from multiple vendors and later returns without losing the history.

| Cost transaction               |      Amount treatment |
| ------------------------------ | --------------------: |
| ABC Supply purchase            | Adds to material cost |
| Home Depot day-of-job purchase | Adds to material cost |
| Unused shingle return          | Reduces material cost |
| Labor crew invoice             |    Adds to labor cost |
| Additional repair labor        |    Adds to labor cost |

The application then calculates:

> **Final Material Cost = Purchases − Returns**

> **Final Labor Cost = Sum of approved labor charges**

An owner would mark each cost category final only after the reconciliation is complete. If a final value must later change, the app would require the job to be reopened and would record the reason, user, time, old value, and new value.

## How commission should be represented

Your rules should be stored in **Settings**, not hard-coded into individual jobs. Each commission rule should have an effective date so a future rate change does not recalculate old approved jobs.

The settings should support:

| Rule type              | Current example                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| Default sales-rep rate | 40% of commissionable profit                                              |
| Rep-specific rate      | Charlie at 50%                                                            |
| Owner override         | 10%, with applicability still to be confirmed                             |
| Company share          | Calculated residual after approved commission allocations and adjustments |
| Effective date         | Date from which the rate applies                                          |
| Expiration date        | Optional end date when a rule changes                                     |

Each person’s share must be stored as a separate **Commission Allocation** record. A job with a sales rep and an owner override should not contain `40%/10%` in one cell. It should contain two allocation rows.

| Job          | Recipient  | Allocation type          |       Rate | Earned amount |
| ------------ | ---------- | ------------------------ | ---------: | ------------: |
| JJ-2026-0041 | Sales Rep  | Primary sales commission |        40% |    Calculated |
| JJ-2026-0041 | Owner      | Owner override           |        10% |    Calculated |
| JJ-2026-0041 | JJ Roofing | Company residual         | Calculated |    Calculated |

## Draws, advances, payments, and clawbacks

A draw should never overwrite the commission amount. It should be a separate transaction tied to the job and recipient.

| Transaction field    | Required value                                    |
| -------------------- | ------------------------------------------------- |
| Job                  | Specific job funding the draw                     |
| Rep                  | Person receiving it                               |
| Type                 | Draw, commission payment, adjustment, or clawback |
| Amount               | Numeric amount                                    |
| Date                 | Transaction date                                  |
| Reason               | Required explanation                              |
| Entered by           | Signed-in owner                                   |
| Attachment/reference | Optional check, ACH, or supporting record         |

The balance would be calculated automatically:

> **Commission Owed = Approved Commission − Draws − Commission Payments − Applied Clawbacks**

If a rep was overpaid, the application would create a **negative rep-ledger balance**. Future approved commissions would offset that balance until the company is repaid. This preserves the history without asking the rep to return cash immediately.

## What the application would look like

The first release should focus on financial operations rather than attempting to become a full CRM immediately.

| Screen                  | Main purpose                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Dashboard**           | Jobs awaiting cost finalization, depreciation checks, commission approval, and payment                        |
| **Jobs**                | Searchable job list with financial and collection statuses                                                    |
| **Job Detail**          | Overview, contract, collections, costs, profitability, commissions, payments, documents, and activity history |
| **Collections**         | Record every insurance and customer payment and show outstanding balances                                     |
| **Cost Reconciliation** | Enter purchases, returns, and labor charges; approve final totals                                             |
| **Commission Review**   | Display proposed allocations and require owner approval                                                       |
| **Payments & Draws**    | Record commission transactions and calculate remaining balances                                               |
| **Rep Ledger**          | Show each rep’s earned, approved, paid, owed, and carry-forward clawback balances                             |
| **Settings**            | Manage commission rates, owner overrides, users, roles, and effective dates                                   |
| **Audit Log**           | Show every important financial edit and workflow transition                                                   |
| **Reports**             | Job profitability, company profit, unpaid commission, outstanding depreciation, and rep performance           |

## AppSheet versus a dedicated internal application

| Consideration              | Google AppSheet operational app                                           | Dedicated internal application                                                           |
| -------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Development approach       | No-code configuration                                                     | Custom frontend, backend API, and database                                               |
| Day-to-day user experience | Mobile/web app                                                            | Fully customized mobile-friendly web app                                                 |
| Database flexibility       | Good with a properly selected source                                      | Full control over schema, rules, reporting, and performance                              |
| Complex commission logic   | Possible, but expressions and exceptions can become difficult to maintain | Business rules can be implemented and tested centrally                                   |
| Permanent audit history    | Requires a custom audit table or enterprise export strategy               | Can be designed as a permanent append-only audit ledger                                  |
| Permissions                | Supported, with careful security configuration                            | Fully tailored owner, admin, accounting, and rep roles                                   |
| Future CRM expansion       | Possible, but increasingly constrained as complexity grows                | Strong foundation for adding leads, customers, production, communications, and documents |
| Ownership and portability  | Tied to the AppSheet platform                                             | Application and data model can be controlled by JJ Roofing                               |
| Best use                   | Faster low-code implementation or interim system                          | Long-term operational and financial platform                                             |

## My recommendation

Based on your preference to leave Google Sheets, your changing commission rules, insurance collection workflow, split allocations, draws, clawbacks, and possible future CRM needs, I recommend a **dedicated internal application**.

The first version should be a focused **job-financial operating system**, not a broad CRM. It should establish a clean database, backend financial rules, owner approvals, permanent audit events, and transaction ledgers. CRM functions can then be added later without compromising the financial foundation.

The application should use a clear production architecture:

| Component                | Responsibility                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Responsive web interface | Owner and optional rep screens                                                             |
| Backend API              | Validation, calculations, approvals, and workflow rules                                    |
| Relational database      | Jobs, collections, costs, commission allocations, transactions, settings, and audit events |
| Authentication and roles | Owner, administrator/accounting, and rep access                                            |
| Document storage         | Contracts, invoices, receipts, COCs, and payment records                                   |
| Background processes     | Reminders, aging alerts, depreciation follow-up, and scheduled reports                     |
| Append-only audit ledger | Permanent old/new values, user, timestamp, and reason                                      |

## Five remaining decisions

Your answers resolved most of the original questions. These five decisions are still necessary before the commission engine can be specified correctly.

1. **Owner override applicability:** Do Justin and Ian each receive a 10% override on every job, does only one of them receive 10%, or does the recipient depend on who manages the job?
2. **Owner-as-salesperson rule:** When Justin or Ian personally sells the job, do they receive the primary sales commission in addition to an owner override? If yes, what primary sales rate applies?
3. **Charlie’s rule:** Is Charlie’s 50% the complete primary sales commission while owner override allocations remain separate?
4. **Fee calculation order:** Are referral fees, Supp X fees, sales-rep fees, and other adjustments deducted from job profit **before** commission percentages are applied, or are some charged only against the company’s residual share afterward?
5. **Completion authority:** What exact event marks a job complete, and which owner or role may approve final costs, approve commission, and reopen a closed job?

Once these five rules are answered, the next practical deliverable should be the **application requirements and data-model specification**. That document would define every screen, table, field, formula, permission, status transition, audit event, and migration rule before development begins.

## References

[1]: https://about.appsheet.com/how-to-create-an-app/ 'Google AppSheet — How to create an app'
[2]: https://support.google.com/appsheet/answer/10105078?hl=en 'Google AppSheet Help — Security: The Essentials'
[3]: https://cloud.google.com/appsheet/automation 'Google Cloud — AppSheet Automation'
[4]: https://support.google.com/appsheet/answer/10104794?hl=en 'Google AppSheet Help — Monitor app activity using Audit History'
