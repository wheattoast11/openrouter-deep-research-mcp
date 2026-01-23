# Zero RFP Management: Complete User Journey

**For SMB Owners | Non-Technical Audience**

---

## Executive Summary

This document describes how Zero manages Request for Proposal (RFP) workflows using interaction combinators - a mathematical framework that ensures correctness by construction. The system guides non-technical SMB owners through vendor selection with guardrails against overspending.

### Interaction Combinator Mapping

| Combinator | Operation | RFP Stage |
|------------|-----------|-----------|
| gamma (construct) | Create structure | RFP creation from requirements |
| gamma (destruct) | Extract data | Parse vendor responses |
| delta (duplicate) | Fork parallel | Send to multiple vendors |
| delta (erase) | Resolve choice | Select winning vendor (AMB point) |
| epsilon (annihilate) | Complete | Workflow termination |

---

## State Machine

```
                         +------------------+
                         |    INITIATE      |
                         | User has a need  |
                         +--------+---------+
                                  |
                                  | gamma_construct
                                  v
                         +------------------+
                         |   RFP_DRAFTED    |
                         | Structured RFP   |
                         +--------+---------+
                                  |
                                  | delta_duplicate
                                  v
                    +-------------+-------------+
                    |             |             |
                    v             v             v
              +---------+   +---------+   +---------+
              | VENDOR_A|   | VENDOR_B|   | VENDOR_C|
              | (pending)|  | (pending)|  | (pending)|
              +----+----+   +----+----+   +----+----+
                    |             |             |
                    | gamma_destruct (parse responses)
                    v             v             v
              +---------+   +---------+   +---------+
              | QUOTE_A |   | QUOTE_B |   | QUOTE_C |
              | $X/mo   |   | $Y/mo   |   | timeout |
              +----+----+   +----+----+   +----+----+
                    |             |             |
                    +------+------+             |
                           |                    | (handled)
                           v                    v
                    +------+------+      +------------+
                    |  COMPARISON |      | ESCALATION |
                    |   MATRIX    |      | (optional) |
                    +------+------+      +------------+
                           |
                           | delta_erase (AMB point - user choice)
                           v
                    +------+------+
                    |   SELECTED  |
                    | Vendor B    |
                    +------+------+
                           |
                           | epsilon_annihilate
                           v
                    +------+------+
                    |   COMPLETE  |
                    | Audit trail |
                    +-------------+
```

---

## Phase 1: Initiation (User Need)

### What the User Experiences

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Good morning, Sarah.                                        |
|                                                              |
|  What can I help you with today?                             |
|                                                              |
|  +--------------------------------------------------------+  |
|  | I need to find a cleaning company for our office       |  |
|  +--------------------------------------------------------+  |
|                                                    [Send]    |
|                                                              |
+==============================================================+
```

### Zero's Response

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  I'll help you find an office cleaning company.              |
|                                                              |
|  To get the best quotes, I need a few details:               |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  OFFICE DETAILS                                        |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Office size: [_________] sq ft                        |  |
|  |                                                        |  |
|  |  Location: [123 Main St, Suite 200__________]          |  |
|  |                                                        |  |
|  |  Floors:   [ 1 ] [v]                                   |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  CLEANING REQUIREMENTS                                 |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Frequency:                                            |  |
|  |    ( ) Daily                                           |  |
|  |    (*) 3x per week                                     |  |
|  |    ( ) Weekly                                          |  |
|  |    ( ) Bi-weekly                                       |  |
|  |                                                        |  |
|  |  Services needed:                                      |  |
|  |    [x] Vacuuming & mopping                             |  |
|  |    [x] Restroom cleaning                               |  |
|  |    [x] Trash removal                                   |  |
|  |    [ ] Window cleaning                                 |  |
|  |    [x] Kitchen/break room                              |  |
|  |    [ ] Carpet deep clean                               |  |
|  |                                                        |  |
|  |  Special requirements: [________________________]      |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  BUDGET                                                |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Monthly budget:  $[______] /month                     |  |
|  |                                                        |  |
|  |  Budget flexibility:                                   |  |
|  |    ( ) Strict - do not exceed                          |  |
|  |    (*) Flexible - can go 10-15% over for quality       |  |
|  |    ( ) Open - quality is priority                      |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|                                        [Skip] [Continue]     |
|                                                              |
+==============================================================+
```

### Dialogue Script

**Zero**: "I'll help you find an office cleaning company. To get the best quotes, I need a few details."

**User**: *fills in form*

**Zero**: "Got it. Before I search for vendors, let me confirm:"

---

## Phase 2: RFP Creation (gamma_construct)

### Zero Structures the RFP

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  I've drafted your RFP. Please review:                       |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  REQUEST FOR PROPOSAL                                  |  |
|  |  Office Cleaning Services                              |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  CLIENT: Sarah's Marketing Agency                      |  |
|  |  RFP ID: RFP-2025-1215-001                             |  |
|  |  ISSUED: December 15, 2025                             |  |
|  |  RESPONSE DUE: December 22, 2025                       |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  SCOPE OF WORK                                         |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Location:                                             |  |
|  |    123 Main Street, Suite 200                          |  |
|  |    Portland, OR 97201                                  |  |
|  |    Single floor, approximately 2,500 sq ft             |  |
|  |                                                        |  |
|  |  Service Schedule:                                     |  |
|  |    Monday, Wednesday, Friday                           |  |
|  |    After 6:00 PM (office closes at 5:30 PM)            |  |
|  |                                                        |  |
|  |  Required Services:                                    |  |
|  |    - Vacuum all carpeted areas                         |  |
|  |    - Mop hard floor surfaces                           |  |
|  |    - Clean and sanitize restrooms (2)                  |  |
|  |    - Empty all trash receptacles (15)                  |  |
|  |    - Clean kitchen/break room surfaces                 |  |
|  |    - Wipe down door handles and light switches         |  |
|  |                                                        |  |
|  |  Insurance Requirements:                               |  |
|  |    - General liability: $1M minimum                    |  |
|  |    - Workers compensation: Required                    |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  EVALUATION CRITERIA                                   |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |    Price ............................ 40%              |  |
|  |    References/Reviews ............... 25%              |  |
|  |    Experience ....................... 20%              |  |
|  |    Insurance/Bonding ................ 15%              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  BUDGET PARAMETERS                                     |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |    Target:  $800/month                                 |  |
|  |    Maximum: $920/month (hard cap)                      |  |
|  |                                                        |  |
|  |    [!] Budget Guardian ACTIVE                          |  |
|  |        Quotes exceeding $920 will be flagged           |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Does this look correct?                                     |
|                                                              |
|  [Edit Requirements]  [Edit Budget]  [Approve & Send]        |
|                                                              |
+==============================================================+
```

### Budget Guardian Integration

The Budget Guardian pattern is embedded at RFP creation:

```
BudgetGuardian = {
  target: 800,
  hard_cap: 920,         // 115% of target
  warning_threshold: 0.9, // Alert at 90% of hard_cap ($828)
  auto_reject: true,      // Quotes > hard_cap automatically flagged
  require_justification: true  // User must acknowledge overages
}
```

### User Interaction

**User**: *clicks "Approve & Send"*

**Zero**: "Perfect. I'm now searching for qualified vendors in Portland. This typically takes 2-3 minutes."

---

## Phase 3: Vendor Outreach (delta_duplicate)

### Zero's Search & Parallel Dispatch

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Finding qualified vendors...                                |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  VENDOR SEARCH                                   [|||  ] |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Searched: Google Business, Yelp, Thumbtack            |  |
|  |  Found: 12 cleaning companies in Portland area         |  |
|  |  Filtered: 5 meet insurance requirements               |  |
|  |                                                        |  |
|  |  Qualified Vendors:                                    |  |
|  |                                                        |  |
|  |  [x] Sparkle Clean Portland      4.8* (127 reviews)    |  |
|  |      Commercial specialist, 8 years in business        |  |
|  |                                                        |  |
|  |  [x] Rose City Janitorial        4.6* (89 reviews)     |  |
|  |      Family-owned, eco-friendly products               |  |
|  |                                                        |  |
|  |  [x] Pacific NW Cleaning Co      4.7* (203 reviews)    |  |
|  |      Large commercial accounts, 24/7 support           |  |
|  |                                                        |  |
|  |  [x] Green & Clean PDX           4.9* (45 reviews)     |  |
|  |      Certified green cleaning, newer company           |  |
|  |                                                        |  |
|  |  [ ] Metro Maintenance           4.2* (56 reviews)     |  |
|  |      Lower reviews, some complaints about reliability  |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  I've pre-selected 4 vendors based on ratings and           |
|  your requirements. Want me to proceed?                      |
|                                                              |
|  [Select Different Vendors]  [Send RFP to Selected]          |
|                                                              |
+==============================================================+
```

### Parallel Dispatch (delta_duplicate)

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  RFP sent to 4 vendors.                                      |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  OUTREACH STATUS                                       |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Sparkle Clean Portland                                |  |
|  |  [====] Delivered  |  Response due: Dec 22             |  |
|  |                                                        |  |
|  |  Rose City Janitorial                                  |  |
|  |  [====] Delivered  |  Response due: Dec 22             |  |
|  |                                                        |  |
|  |  Pacific NW Cleaning Co                                |  |
|  |  [====] Delivered  |  Response due: Dec 22             |  |
|  |                                                        |  |
|  |  Green & Clean PDX                                     |  |
|  |  [====] Delivered  |  Response due: Dec 22             |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  I'll notify you as responses come in. You can also         |
|  check status anytime by asking "RFP status".               |
|                                                              |
|  Typical response time: 1-3 business days                   |
|                                                              |
+==============================================================+
```

### Internal State (delta_duplicate representation)

```javascript
// Interaction net representation
{
  type: 'delta_duplicate',
  input: {
    rfp: 'RFP-2025-1215-001',
    payload: structuredRFP
  },
  outputs: [
    { vendorId: 'sparkle-clean', status: 'pending', sentAt: '2025-12-15T10:30:00Z' },
    { vendorId: 'rose-city', status: 'pending', sentAt: '2025-12-15T10:30:01Z' },
    { vendorId: 'pacific-nw', status: 'pending', sentAt: '2025-12-15T10:30:02Z' },
    { vendorId: 'green-clean', status: 'pending', sentAt: '2025-12-15T10:30:03Z' }
  ],
  deadline: '2025-12-22T17:00:00Z'
}
```

---

## Phase 4: Response Collection (gamma_destruct)

### Notification: First Response

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [!] NEW QUOTE RECEIVED                                |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Sparkle Clean Portland                                |  |
|  |  Received: December 16, 2025 at 2:15 PM                |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Would you like to review now or wait for more quotes?      |
|                                                              |
|  [Review Now]  [Wait for More]  [View Summary]               |
|                                                              |
+==============================================================+
```

### Status Dashboard (Partial Responses)

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  RFP Status: Office Cleaning Services                        |
|  Due: Dec 22, 2025 (3 days remaining)                        |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  VENDOR RESPONSES                          2 of 4      |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  [*] Sparkle Clean Portland                            |  |
|  |      Quote: $750/month                                 |  |
|  |      Status: RECEIVED Dec 16                           |  |
|  |      [View Details]                                    |  |
|  |                                                        |  |
|  |  [*] Rose City Janitorial                              |  |
|  |      Quote: $825/month                                 |  |
|  |      Status: RECEIVED Dec 17                           |  |
|  |      [View Details]                                    |  |
|  |                                                        |  |
|  |  [ ] Pacific NW Cleaning Co                            |  |
|  |      Status: PENDING (viewed RFP Dec 15)               |  |
|  |                                                        |  |
|  |  [ ] Green & Clean PDX                                 |  |
|  |      Status: PENDING (not yet viewed)                  |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Both received quotes are within your budget of $920/mo.    |
|                                                              |
|  [Send Reminder to Pending]  [Close RFP Early]  [Wait]       |
|                                                              |
+==============================================================+
```

### Error Handling: Vendor Non-Response

**Scenario**: Deadline passes, 2 vendors haven't responded.

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [!] RFP DEADLINE REACHED                              |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Your RFP deadline (Dec 22) has passed.                |  |
|  |                                                        |  |
|  |  Responses received: 3 of 4                            |  |
|  |                                                        |  |
|  |  [*] Sparkle Clean Portland .... $750/mo               |  |
|  |  [*] Rose City Janitorial ...... $825/mo               |  |
|  |  [*] Pacific NW Cleaning Co .... $890/mo               |  |
|  |  [ ] Green & Clean PDX ......... No response           |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  What would you like to do?                                  |
|                                                              |
|  (*) Proceed with 3 quotes                                   |
|  ( ) Extend deadline 3 days for Green & Clean                |
|  ( ) Send final reminder to Green & Clean                    |
|  ( ) Remove Green & Clean and proceed                        |
|                                                              |
|                                              [Continue]       |
|                                                              |
+==============================================================+
```

### Quote Parsing (gamma_destruct)

Zero extracts structured data from vendor responses:

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Quote Details: Sparkle Clean Portland                       |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  PRICING                                               |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Monthly Rate:        $750.00                          |  |
|  |  Setup Fee:           $0.00 (waived)                   |  |
|  |  Contract Length:     12 months                        |  |
|  |  Price Lock:          Guaranteed 12 months             |  |
|  |                                                        |  |
|  |  [ ] Within Budget    Target: $800 | This: $750        |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  SERVICES INCLUDED                                     |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  [*] Vacuuming & mopping                               |  |
|  |  [*] Restroom cleaning                                 |  |
|  |  [*] Trash removal                                     |  |
|  |  [*] Kitchen/break room                                |  |
|  |  [ ] Window cleaning (add $50/mo)                      |  |
|  |  [*] Door handles & switches                           |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  INSURANCE & COMPLIANCE                                |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  General Liability:   $2M   [VERIFIED]                 |  |
|  |  Workers Comp:        Yes   [VERIFIED]                 |  |
|  |  Bonded:              Yes                              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  REFERENCES                                            |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  "Reliable and thorough. Use them for 3 years."        |  |
|  |    - TechStart Inc (similar size office)               |  |
|  |                                                        |  |
|  |  "Responsive when issues arise. Recommended."          |  |
|  |    - Portland Legal Group                              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|                    [Compare All]  [Back to List]             |
|                                                              |
+==============================================================+
```

---

## Phase 5: Selection (delta_erase - AMB Point)

### Comparison Matrix

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Quote Comparison Matrix                                     |
|                                                              |
|  +--------------------------------------------------------+  |
|  |            | Sparkle   | Rose City | Pacific NW        |  |
|  |            | Clean     | Janitorial| Cleaning          |  |
|  +--------------------------------------------------------+  |
|  | PRICE      |           |           |                   |  |
|  | Monthly    | $750      | $825      | $890              |  |
|  | vs Budget  | -6%       | +3%       | +11%              |  |
|  | Setup Fee  | $0        | $0        | $150              |  |
|  +--------------------------------------------------------+  |
|  | QUALITY    |           |           |                   |  |
|  | Rating     | 4.8*      | 4.6*      | 4.7*              |  |
|  | Reviews    | 127       | 89        | 203               |  |
|  | Years      | 8         | 12        | 5                 |  |
|  +--------------------------------------------------------+  |
|  | SERVICES   |           |           |                   |  |
|  | All Req'd  | Yes       | Yes       | Yes               |  |
|  | Extras     | +$50 win  | Included  | +$75 win          |  |
|  | Eco-Cert   | No        | Yes       | No                |  |
|  +--------------------------------------------------------+  |
|  | TERMS      |           |           |                   |  |
|  | Contract   | 12 mo     | 6 mo      | 12 mo             |  |
|  | Cancellation| 30 days  | 14 days   | 60 days           |  |
|  +--------------------------------------------------------+  |
|  | ZERO SCORE | 87/100    | 82/100    | 71/100            |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  [!] Pacific NW quote of $890 approaches your $920 limit.    |
|                                                              |
+==============================================================+
```

### Budget Guardian Alert

When a quote exceeds warning threshold:

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [$] BUDGET GUARDIAN ALERT                             |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Pacific NW Cleaning Co quote: $890/month              |  |
|  |                                                        |  |
|  |  This is 11% above your target ($800) and              |  |
|  |  96% of your hard cap ($920).                          |  |
|  |                                                        |  |
|  |  Annual impact: $10,680 vs target $9,600               |  |
|  |  Overage: $1,080/year                                  |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Other options:                                        |  |
|  |                                                        |  |
|  |  Sparkle Clean @ $750/mo saves you $1,680/year         |  |
|  |  Rose City @ $825/mo saves you $780/year               |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Pacific NW has more reviews but the price difference       |
|  is significant. Sparkle Clean has comparable quality       |
|  at a better price.                                          |
|                                                              |
|  [See Full Analysis]  [Ask a Question]                       |
|                                                              |
+==============================================================+
```

### AMB Point: User Decision

This is the critical "ambiguous" choice point in the interaction net - only the user can resolve it:

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  DECISION TIME                                         |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Based on your criteria, here's my recommendation:           |
|                                                              |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |   RECOMMENDED: Sparkle Clean Portland                  |  |
|  |                                                        |  |
|  |   Why:                                                 |  |
|  |   - Best price at $750/mo (6% under budget)            |  |
|  |   - Highest rating (4.8*) among finalists              |  |
|  |   - 8 years experience with commercial clients         |  |
|  |   - Waived setup fee                                   |  |
|  |   - Strong reference from similar-size office          |  |
|  |                                                        |  |
|  |   Trade-off:                                           |  |
|  |   - Not eco-certified (Rose City is)                   |  |
|  |   - Longer cancellation notice (30 vs 14 days)         |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Do you have questions before deciding?                      |
|                                                              |
|  +--------------------------------------------------------+  |
|  | Ask Zero: [________________________________]  [Ask]    |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Ready to select?                                            |
|                                                              |
|  ( ) Sparkle Clean Portland - $750/mo [Recommended]          |
|  ( ) Rose City Janitorial - $825/mo                          |
|  ( ) Pacific NW Cleaning - $890/mo                           |
|  ( ) None - extend search                                    |
|                                                              |
|                                        [Make Selection]      |
|                                                              |
+==============================================================+
```

### Clarifying Questions Flow

```
User: "Is the eco-certification important? What does it actually mean?"

Zero: "Eco-certification (like Green Seal or EcoLogo) means:

1. Cleaning products are non-toxic and biodegradable
2. Lower VOC emissions (better indoor air quality)
3. Sustainable packaging and practices

For a marketing agency, it could matter if:
- You have employees with chemical sensitivities
- Your clients value sustainability (could be a talking point)
- Your lease requires certain environmental standards

Rose City uses Green Seal certified products. Sparkle Clean uses
'low-chemical' products but isn't formally certified.

Would you like me to ask Sparkle Clean about their specific products?"
```

---

## Phase 6: Completion (epsilon_annihilate)

### Vendor Selection Confirmed

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Selection Confirmed: Sparkle Clean Portland                 |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  CONTRACT SUMMARY                                      |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Vendor:     Sparkle Clean Portland                    |  |
|  |  Service:    Office Cleaning (3x/week)                 |  |
|  |  Monthly:    $750.00                                   |  |
|  |  Annual:     $9,000.00                                 |  |
|  |  Start Date: January 2, 2026                           |  |
|  |  Contract:   12 months                                 |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  I'm generating your acceptance letter now.                  |
|                                                              |
|  [Generating...] =============================>              |
|                                                              |
+==============================================================+
```

### Acceptance Letter Generated

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  Acceptance Letter Ready                                     |
|                                                              |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Sarah's Marketing Agency                              |  |
|  |  123 Main Street, Suite 200                            |  |
|  |  Portland, OR 97201                                    |  |
|  |                                                        |  |
|  |  December 19, 2025                                     |  |
|  |                                                        |  |
|  |  Sparkle Clean Portland                                |  |
|  |  456 Industrial Way                                    |  |
|  |  Portland, OR 97209                                    |  |
|  |                                                        |  |
|  |  RE: Acceptance of Proposal - Office Cleaning Services |  |
|  |                                                        |  |
|  |  Dear Sparkle Clean Team,                              |  |
|  |                                                        |  |
|  |  We are pleased to accept your proposal dated          |  |
|  |  December 16, 2025 for office cleaning services        |  |
|  |  at the following terms:                               |  |
|  |                                                        |  |
|  |  - Monthly Rate: $750.00                               |  |
|  |  - Service Schedule: Mon/Wed/Fri after 6:00 PM         |  |
|  |  - Start Date: January 2, 2026                         |  |
|  |  - Contract Term: 12 months                            |  |
|  |                                                        |  |
|  |  Please send your service agreement for signature.     |  |
|  |                                                        |  |
|  |  Best regards,                                         |  |
|  |  Sarah Chen                                            |  |
|  |  Sarah's Marketing Agency                              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  [Edit Letter]  [Download PDF]  [Send via Email]             |
|                                                              |
+==============================================================+
```

### Rejection Letters (Auto-generated)

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  I've drafted polite rejection letters for the other        |
|  vendors. Would you like me to send them?                    |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  TO: Rose City Janitorial                              |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Thank you for submitting your proposal for office     |  |
|  |  cleaning services. After careful consideration, we    |  |
|  |  have decided to proceed with another vendor.          |  |
|  |                                                        |  |
|  |  We appreciate the time you invested in responding     |  |
|  |  to our RFP and will keep your information on file     |  |
|  |  for future needs.                                     |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  [ ] Rose City Janitorial                                    |
|  [ ] Pacific NW Cleaning Co                                  |
|                                                              |
|  [Preview All]  [Send Selected]  [Skip]                      |
|                                                              |
+==============================================================+
```

### Workflow Completion (epsilon_annihilate)

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  RFP WORKFLOW COMPLETE                                       |
|                                                              |
|  +--------------------------------------------------------+  |
|  |  SUMMARY                                               |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  RFP ID:          RFP-2025-1215-001                    |  |
|  |  Service:         Office Cleaning                      |  |
|  |  Duration:        4 days (Dec 15-19)                   |  |
|  |                                                        |  |
|  |  Vendors Contacted: 4                                  |  |
|  |  Quotes Received:   3                                  |  |
|  |  Selected:          Sparkle Clean Portland             |  |
|  |                                                        |  |
|  |  Budget Target:     $800/month                         |  |
|  |  Actual:            $750/month                         |  |
|  |  Savings:           $50/month ($600/year)              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  AUDIT TRAIL                                           |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Dec 15  RFP created                                   |  |
|  |  Dec 15  Sent to 4 vendors                             |  |
|  |  Dec 16  Quote received: Sparkle Clean ($750)          |  |
|  |  Dec 17  Quote received: Rose City ($825)              |  |
|  |  Dec 18  Quote received: Pacific NW ($890)             |  |
|  |  Dec 19  Vendor selected: Sparkle Clean                |  |
|  |  Dec 19  Acceptance letter sent                        |  |
|  |  Dec 19  Rejection letters sent (2)                    |  |
|  |  Dec 19  WORKFLOW COMPLETE                             |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|  |  DOCUMENTS                                             |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  [PDF] Original RFP                                    |  |
|  |  [PDF] Sparkle Clean Quote                             |  |
|  |  [PDF] Rose City Quote                                 |  |
|  |  [PDF] Pacific NW Quote                                |  |
|  |  [PDF] Acceptance Letter                               |  |
|  |  [PDF] Comparison Matrix                               |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Next Steps:                                                 |
|  - Sparkle Clean will send service agreement                 |
|  - First cleaning: January 2, 2026                           |
|  - I'll remind you to review after first month               |
|                                                              |
|  [Download All Documents]  [Close]                           |
|                                                              |
+==============================================================+
```

---

## Error Handling Scenarios

### Scenario 1: All Vendors Exceed Budget

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [$] BUDGET ALERT: All Quotes Exceed Target            |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Your budget: $800/month (hard cap: $920)              |  |
|  |                                                        |  |
|  |  Quotes received:                                      |  |
|  |    Vendor A: $950/month (+19% over target) [OVER CAP]  |  |
|  |    Vendor B: $1,100/month (+38% over target) [OVER CAP]|  |
|  |    Vendor C: $875/month (+9% over target)              |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Options:                                                    |
|                                                              |
|  1. Accept Vendor C at $875/mo                              |
|     (9% over target, within hard cap)                        |
|                                                              |
|  2. Reduce scope to meet budget                             |
|     - Switch to 2x/week: ~$600-650/mo                        |
|     - Remove kitchen cleaning: ~$50-75 savings               |
|                                                              |
|  3. Increase budget                                         |
|     Market rate for your requirements appears to be          |
|     $850-950/month in Portland area.                         |
|                                                              |
|  4. Search for more vendors                                 |
|     I can expand search to include newer companies           |
|     or those slightly outside your area.                     |
|                                                              |
|  [Discuss Options]  [Select Vendor C]  [Modify Requirements] |
|                                                              |
+==============================================================+
```

### Scenario 2: No Vendor Responses

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [!] NO RESPONSES RECEIVED                             |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  RFP deadline passed with 0 of 4 responses.            |  |
|  |                                                        |  |
|  |  Possible reasons:                                     |  |
|  |  - Holiday season (high demand period)                 |  |
|  |  - Budget may be below market rate                     |  |
|  |  - Requirements may be unusual for the area            |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  I recommend:                                                |
|                                                              |
|  1. Extend deadline by 1 week                               |
|  2. Contact vendors directly to confirm receipt              |
|  3. Consider adjusting budget or requirements                |
|                                                              |
|  Would you like me to:                                       |
|                                                              |
|  [ ] Re-send RFP with extended deadline                      |
|  [ ] Call vendors to follow up (requires your approval)      |
|  [ ] Search for additional vendors                           |
|  [ ] Analyze if requirements need adjustment                 |
|                                                              |
|                                              [Continue]       |
|                                                              |
+==============================================================+
```

### Scenario 3: Vendor Withdraws After Selection

```
+============================================================+
|  Zero                                            [_] [O] [X] |
+============================================================+
|                                                              |
|  +--------------------------------------------------------+  |
|  |  [!] VENDOR WITHDRAWAL                                 |  |
|  +--------------------------------------------------------+  |
|  |                                                        |  |
|  |  Sparkle Clean Portland has withdrawn their quote.     |  |
|  |                                                        |  |
|  |  Reason provided:                                      |  |
|  |  "Unable to accommodate the requested start date       |  |
|  |  due to staffing constraints."                         |  |
|  |                                                        |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Your RFP is still active. Here are your options:           |
|                                                              |
|  REMAINING QUOTES:                                          |
|                                                              |
|  1. Rose City Janitorial - $825/mo                          |
|     Available to start: Jan 6, 2026                          |
|     Still within your $920 hard cap                          |
|                                                              |
|  2. Pacific NW Cleaning - $890/mo                           |
|     Available to start: Dec 28, 2025                         |
|     Approaches your budget limit                             |
|                                                              |
|  [Select Rose City]  [Select Pacific NW]  [Restart Search]   |
|                                                              |
+==============================================================+
```

---

## Budget Guardian Pattern Detail

### Configuration

```javascript
// Budget Guardian embedded in RFP state
BudgetGuardian = {
  // Hard limits
  target: number,           // User's stated budget
  hard_cap: number,         // Absolute maximum (default: 115% of target)

  // Thresholds
  warning_threshold: 0.9,   // Alert at 90% of hard cap
  critical_threshold: 0.95, // Strong warning at 95%

  // Behaviors
  auto_reject: boolean,     // Auto-flag quotes over hard cap
  require_justification: boolean,  // User must acknowledge overages

  // Computed at RFP creation
  annual_target: target * 12,
  annual_cap: hard_cap * 12,

  // Methods
  evaluate(quote) {
    const ratio = quote / target;
    if (quote > hard_cap) return { status: 'OVER_CAP', action: 'flag' };
    if (ratio > critical_threshold) return { status: 'CRITICAL', action: 'warn_strong' };
    if (ratio > warning_threshold) return { status: 'WARNING', action: 'warn' };
    if (ratio <= 1.0) return { status: 'WITHIN_BUDGET', action: 'none' };
    return { status: 'SLIGHTLY_OVER', action: 'note' };
  }
}
```

### Visual Indicator System

```
BUDGET VISUALIZATION:

Target: $800/mo
  |
  |----[============================]----| $800 TARGET
  |                                 [!!] | $828 WARNING (90% of cap)
  |                                   [X]| $874 CRITICAL (95% of cap)
  |                                    | | $920 HARD CAP
  |
Quote positions:
  Sparkle Clean: $750   [===================      ] -6%
  Rose City:     $825   [========================!] +3%
  Pacific NW:    $890   [==========================X=] +11%
```

---

## Interaction Combinator State Trace

Complete state trace for the RFP workflow:

```
t=0: INIT
     User: "I need office cleaning"
     State: { need: "cleaning", params: null }

t=1: GAMMA_CONSTRUCT (structure creation)
     Input: natural language requirements
     Output: structured RFP document
     State: {
       rfp: RFP-2025-1215-001,
       budget: { target: 800, cap: 920 },
       requirements: [...],
       status: 'drafted'
     }

t=2: DELTA_DUPLICATE (parallel fork)
     Input: single RFP
     Output: 4 parallel vendor channels
     State: {
       rfp: RFP-2025-1215-001,
       channels: [
         { vendor: 'sparkle', status: 'pending' },
         { vendor: 'rose-city', status: 'pending' },
         { vendor: 'pacific-nw', status: 'pending' },
         { vendor: 'green-clean', status: 'pending' }
       ]
     }

t=3: GAMMA_DESTRUCT (response parsing) x3
     Input: raw vendor responses
     Output: structured quotes
     State: {
       rfp: RFP-2025-1215-001,
       quotes: [
         { vendor: 'sparkle', amount: 750, parsed: {...} },
         { vendor: 'rose-city', amount: 825, parsed: {...} },
         { vendor: 'pacific-nw', amount: 890, parsed: {...} }
       ],
       pending: ['green-clean']
     }

t=4: DELTA_ERASE (AMB - selection point)
     Input: 3 quotes + user criteria
     Output: single selection
     AMB_RESOLUTION: User chooses 'sparkle'
     State: {
       rfp: RFP-2025-1215-001,
       selected: 'sparkle',
       rejected: ['rose-city', 'pacific-nw'],
       no_response: ['green-clean']
     }

t=5: EPSILON_ANNIHILATE (completion)
     Input: selection state
     Output: void (workflow terminates)
     Side_Effects: [
       acceptance_letter_generated,
       rejection_letters_sent,
       audit_trail_sealed
     ]
     State: {
       rfp: RFP-2025-1215-001,
       status: 'COMPLETE',
       outcome: {
         vendor: 'sparkle',
         monthly_rate: 750,
         annual_savings: 600,
         start_date: '2026-01-02'
       },
       audit_hash: 'sha256:abc123...'
     }
```

---

## Technical Implementation Notes

### Zero URI Scheme Integration

```javascript
// RFP workflow URIs
zero://rfp/create                    // Initiate new RFP
zero://rfp/{id}                      // View RFP status
zero://rfp/{id}/quotes               // View all quotes
zero://rfp/{id}/compare              // Comparison matrix
zero://rfp/{id}/select/{vendor}      // Select vendor (AMB point)
zero://rfp/{id}/complete             // Finalize workflow

// Fork for what-if analysis
zero://fork/rfp-{id}/scenario-a      // "What if we choose Rose City?"
zero://fork/rfp-{id}/scenario-b      // "What if we reduce scope?"

// Replay for audit
zero://replay/{timestamp}            // Review state at any point
```

### Event Sourcing

All state changes are recorded as events:

```javascript
[
  { type: 'RFP_CREATED', rfpId: '...', timestamp: '...' },
  { type: 'RFP_APPROVED', rfpId: '...', timestamp: '...' },
  { type: 'VENDOR_CONTACTED', rfpId: '...', vendorId: '...', timestamp: '...' },
  { type: 'QUOTE_RECEIVED', rfpId: '...', vendorId: '...', amount: 750, timestamp: '...' },
  { type: 'BUDGET_CHECK', rfpId: '...', vendorId: '...', status: 'WITHIN_BUDGET', timestamp: '...' },
  { type: 'VENDOR_SELECTED', rfpId: '...', vendorId: '...', timestamp: '...' },
  { type: 'WORKFLOW_COMPLETE', rfpId: '...', timestamp: '...' }
]
```

---

## Appendix: Dialogue Scripts

### Opening Prompt Variations

**For returning users:**
"Welcome back, Sarah. You have 1 active RFP (IT Support) and 2 completed this month. What can I help with today?"

**For new RFP:**
"I'll help you find the right vendor. What service do you need?"

**After service identified:**
"Got it - office cleaning. Let me ask a few questions to get you the best quotes."

### Error Recovery Scripts

**Connection issue:**
"I'm having trouble reaching [vendor]. I'll retry automatically. If this continues, I can try their alternate contact."

**Incomplete form:**
"I'm missing [field]. This helps vendors give accurate quotes. What's your [field]?"

**Budget concern:**
"Your budget of [X] is below typical market rates for this service ([Y-Z range]). Would you like to adjust requirements or explore options?"

### Confirmation Scripts

**Before sending RFP:**
"Ready to send this to 4 vendors? They'll have 7 days to respond. [Send] [Edit First]"

**Before selection:**
"You're selecting [Vendor] at [$X/month]. This will send an acceptance letter. Confirm? [Yes, Select] [Review Again]"

**After completion:**
"All done! [Vendor] will contact you to schedule. I'll check in after your first service."

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-15 | Initial specification |

---

*This document is machine-readable. Schema available at `zero://schemas/rfp-journey/1.0.0`*
