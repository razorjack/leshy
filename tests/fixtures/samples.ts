export type Expectation = {
  text: string;
  type: string;
  expect: "catch" | "preserve";
};

export type Sample = {
  name: string;
  input: string;
  gold: Expectation[];
};

/** The brief's five sample inputs. Structural + key-context must catch all of
 * these without the model (verified by tests/detect.test.ts). */
export const samples: Sample[] = [
  {
    name: "json-nested",
    input:
      '{"user":{"id":42,"email":"jan.kowalski@gmail.com","full_name":"Jan Kowalski","phone":"+48 601 234 567","address":"ul. Piękna 12/4, 00-001 Warszawa","pesel":"44051401359"}}',
    gold: [
      { text: "jan.kowalski@gmail.com", type: "email", expect: "catch" },
      { text: "Jan Kowalski", type: "person", expect: "catch" },
      { text: "+48 601 234 567", type: "phone", expect: "catch" },
      { text: "ul. Piękna 12/4, 00-001 Warszawa", type: "address", expect: "catch" },
      { text: "44051401359", type: "pesel", expect: "catch" },
      { text: '"id":42', type: "db-id", expect: "preserve" },
    ],
  },
  {
    name: "ruby-inspect",
    input:
      '#<User id: 42, email: "jan.kowalski@gmail.com", first_name: "Jan", last_name: "Kowalski", created_at: "2024-01-02 10:00:00 +0100">',
    gold: [
      { text: "jan.kowalski@gmail.com", type: "email", expect: "catch" },
      { text: "Jan", type: "person", expect: "catch" },
      { text: "Kowalski", type: "person", expect: "catch" },
      { text: "id: 42", type: "db-id", expect: "preserve" },
      { text: "2024-01-02 10:00:00 +0100", type: "timestamp", expect: "preserve" },
    ],
  },
  {
    name: "ruby-hash",
    input: '{ :email => "anna.nowak@example.org", "name" => "Anna Nowak", :ip => "10.0.0.5" }',
    gold: [
      { text: "anna.nowak@example.org", type: "email", expect: "catch" },
      { text: "Anna Nowak", type: "person", expect: "catch" },
      { text: "10.0.0.5", type: "ip", expect: "catch" },
    ],
  },
  {
    name: "js-objects",
    input: "[ { name: 'Bob Smith', email: 'bob@corp.io', ssn: '123-45-6789' } ]",
    gold: [
      { text: "Bob Smith", type: "person", expect: "catch" },
      { text: "bob@corp.io", type: "email", expect: "catch" },
      { text: "123-45-6789", type: "ssn", expect: "catch" },
    ],
  },
  {
    name: "logfmt",
    input: '2024-01-02T10:00:00Z level=info user_email=carol@foo.com user_id=98123 msg="login ok"',
    gold: [
      { text: "carol@foo.com", type: "email", expect: "catch" },
      { text: "user_id=98123", type: "db-id", expect: "preserve" },
      { text: "2024-01-02T10:00:00Z", type: "timestamp", expect: "preserve" },
    ],
  },
];

/** PII where key names give no hint — only the semantic model catches these
 * (except pl-address, which the structural Polish-address net also covers). */
export const hardSamples: Sample[] = [
  {
    name: "log-freeform",
    input:
      "2024-03-07 ERROR payment failed for Jan Kowalski, redirecting parcel to ul. Marszałkowska 1, 00-624 Warszawa",
    gold: [
      { text: "Jan Kowalski", type: "person", expect: "catch" },
      { text: "ul. Marszałkowska 1, 00-624 Warszawa", type: "address", expect: "catch" },
      { text: "2024-03-07", type: "timestamp", expect: "preserve" },
    ],
  },
  {
    name: "exception-text",
    input:
      "RuntimeError: cannot deliver to Anna Nowak (Acme Sp. z o.o.) — recipient moved from ul. Złota 44, Warszawa",
    gold: [
      { text: "Anna Nowak", type: "person", expect: "catch" },
      { text: "Acme Sp. z o.o.", type: "org", expect: "catch" },
      { text: "ul. Złota 44, Warszawa", type: "address", expect: "catch" },
    ],
  },
  {
    name: "neutral-keys",
    input: '{"assignee":"Bob Smith","note":"escalate to Carol Johnson if unpaid","status":"open"}',
    gold: [
      { text: "Bob Smith", type: "person", expect: "catch" },
      { text: "Carol Johnson", type: "person", expect: "catch" },
    ],
  },
];
