-- Hayve Bites delivers within a city. The 1,000-person simulation found customers in London,
-- Berlin and Toronto could order from New York restaurants; restaurants now carry their city
-- and the app only lists (and accepts orders from) restaurants in the customer's city.
alter table public.restaurants add column if not exists city text not null default '';
create index if not exists restaurants_city_idx on public.restaurants (lower(city));
