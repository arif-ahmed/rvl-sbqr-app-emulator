// Stand-in for the FI's core-banking customer profile. In a real app this
// comes from the FI backend after login; the emulator ships a few demo
// account holders (named after the BRD §5 journeys) so two browser tabs can
// play recipient and sender against each other.

export interface Account {
  id: string;
  type: 'Savings Account' | 'Current Account' | 'Salary Account';
  /** Recipient PAN (Tag 26 sub 03) — up to 19 chars. */
  number: string;
  openingBalance: number;
}

export interface Customer {
  username: string;
  /** Tag 59 — max 25 chars. Signed together with the account number. */
  name: string;
  /** Tag 60 — max 15 chars. */
  city: string;
  /** Tag 61 — optional, max 10 chars. */
  postalCode?: string;
  mobile: string;
  email: string;
  customerId: string;
  segment: string;
  accounts: Account[];
}

export const CUSTOMERS: Customer[] = [
  {
    username: 'fatema',
    name: 'Fatema Akter',
    city: 'Dhaka',
    postalCode: '1212',
    mobile: '+880 1711-111111',
    email: 'fatema@example.com',
    customerId: 'CIF-00458821',
    segment: 'Priority',
    accounts: [
      { id: 'fatema-sa', type: 'Savings Account', number: '2011500000874', openingBalance: 185_400.5 },
      { id: 'fatema-ca', type: 'Current Account', number: '2012100003321', openingBalance: 62_250 },
    ],
  },
  {
    username: 'rafiq',
    name: 'Rafiq Islam',
    city: 'Chattogram',
    postalCode: '4000',
    mobile: '+880 1812-222222',
    email: 'rafiq@example.com',
    customerId: 'CIF-00458822',
    segment: 'Retail',
    accounts: [
      { id: 'rafiq-sa', type: 'Savings Account', number: '2011500001902', openingBalance: 24_380 },
      { id: 'rafiq-sal', type: 'Salary Account', number: '2013300007824', openingBalance: 9_120.75 },
    ],
  },
  {
    username: 'karim',
    name: 'Karim Hossain',
    city: 'Dhaka',
    postalCode: '1205',
    mobile: '+880 1913-333333',
    email: 'karim@example.com',
    customerId: 'CIF-00458823',
    segment: 'Retail',
    accounts: [{ id: 'karim-sa', type: 'Savings Account', number: '2011500002466', openingBalance: 48_900 }],
  },
  {
    username: 'nasrin',
    name: 'Nasrin Sultana',
    city: 'Sylhet',
    mobile: '+880 1614-444444',
    email: 'nasrin@example.com',
    customerId: 'CIF-00458824',
    segment: 'Retail',
    accounts: [
      { id: 'nasrin-sa', type: 'Savings Account', number: '2011500003108', openingBalance: 1_250 },
      { id: 'nasrin-ca', type: 'Current Account', number: '2012100009457', openingBalance: 310_000 },
    ],
  },
];

/** Published fake password of each fi-idp-mock seed user (`<username>@1234`); the IdP checks it. */
export const demoPassword = (username: string) => `${username}@1234`;

export function findCustomer(username: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.username === username.trim().toLowerCase());
}
