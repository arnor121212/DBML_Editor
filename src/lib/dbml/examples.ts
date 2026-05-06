export const ECOMMERCE_DBML = `// E-commerce schema — sample for SchemaSync
// Edit anything on the left; the diagram updates as you type.

Project ecommerce {
  database_type: 'PostgreSQL'
  Note: 'A small commerce schema with users, products, and orders.'
}

Table users {
  id          int        [pk, increment]
  email       varchar    [unique, not null]
  full_name   varchar
  role        user_role  [not null, default: 'customer']
  created_at  timestamp  [default: \`now()\`]
  Note: 'Application users.'
}

Table addresses {
  id        int       [pk, increment]
  user_id   int       [not null, ref: > users.id]
  line1     varchar   [not null]
  line2     varchar
  city      varchar   [not null]
  region    varchar
  country   varchar   [not null]
  postcode  varchar
}

Table categories {
  id         int     [pk, increment]
  name       varchar [not null, unique]
  parent_id  int     [ref: > categories.id]
}

Table products {
  id           int       [pk, increment]
  sku          varchar   [unique, not null]
  name         varchar   [not null]
  description  text
  price_cents  int       [not null]
  category_id  int       [ref: > categories.id]
  status       product_status [not null, default: 'draft']
  created_at   timestamp [default: \`now()\`]

  indexes {
    (category_id, status) [name: 'products_category_status_idx']
  }
}

Table orders {
  id            int       [pk, increment]
  user_id       int       [not null, ref: > users.id]
  shipping_id   int       [ref: > addresses.id]
  status        order_status [not null, default: 'pending']
  total_cents   int       [not null]
  placed_at     timestamp [default: \`now()\`]
}

Table order_items {
  id          int [pk, increment]
  order_id    int [not null, ref: > orders.id]
  product_id  int [not null, ref: > products.id]
  quantity    int [not null, default: 1]
  unit_cents  int [not null]
}

Enum user_role {
  customer
  staff
  admin
}

Enum product_status {
  draft
  active
  archived
}

Enum order_status {
  pending
  paid
  shipped
  delivered
  cancelled
}

TableGroup commerce {
  products
  categories
  orders
  order_items
}
`;

export const BLANK_DBML = `// Start typing DBML here.
// Tip: define a Table, then add a Ref between columns.

Table example {
  id        int     [pk, increment]
  name      varchar [not null]
  created_at timestamp
}
`;
