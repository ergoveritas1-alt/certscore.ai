create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists industries_slug_idx
  on public.industries (slug);

create index if not exists industries_sort_order_idx
  on public.industries (sort_order asc, label asc);

drop trigger if exists industries_set_updated_at on public.industries;
create trigger industries_set_updated_at
before update on public.industries
for each row execute procedure public.set_updated_at();

insert into public.industries (slug, label, sort_order)
values
  ('technology', 'Technology', 10),
  ('retail', 'Retail', 20),
  ('media', 'Media', 30),
  ('health', 'Health', 40),
  ('fintech', 'Fintech', 50),
  ('government', 'Government', 60),
  ('education', 'Education', 70),
  ('travel', 'Travel', 80),
  ('entertainment', 'Entertainment', 90),
  ('social', 'Social', 100)
on conflict (slug) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order;

alter table public.domains
  add column if not exists industry_primary_id uuid;

alter table public.domains
  drop constraint if exists domains_industry_primary_id_fkey;

alter table public.domains
  add constraint domains_industry_primary_id_fkey
  foreign key (industry_primary_id)
  references public.industries (id)
  on delete set null;

create index if not exists domains_industry_primary_id_idx
  on public.domains (industry_primary_id);

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'fintech'
  and lower(domains.hostname) in (
    'betterment.com',
    'chime.com',
    'coinbase.com',
    'fidelity.com',
    'kalshi.com',
    'paypal.com',
    'polymarket.com',
    'robinhood.com',
    'schwab.com',
    'sberbank.ru',
    'stripe.com',
    'tbank.ru',
    'vanguard.com'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'retail'
  and lower(domains.hostname) in (
    'adidas.com',
    'airbnb.com',
    'aliexpress.com',
    'amazon.com',
    'apple.com',
    'bestbuy.com',
    'homedepot.com',
    'hoka.com',
    'nike.com',
    'rei.com',
    'shop.app',
    'target.com',
    'temu.com',
    'timex.com',
    'walmart.com',
    'wayfair.com',
    'www.costco.com',
    'www.cvs.com'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'media'
  and lower(domains.hostname) in (
    'billboard.com',
    'bloomberg.com',
    'businessinsider.com',
    'cbs.com',
    'cnbc.com',
    'cnn.com',
    'espn.com',
    'foxnews.com',
    'huffpost.com',
    'kpbs.org',
    'marketwatch.com',
    'newsweek.com',
    'nytimes.com',
    'washingtonpost.com',
    'wsj.com'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'health'
  and lower(domains.hostname) in (
    'cdc.gov',
    'fda.gov',
    'mayoclinic.org',
    'mcw.edu',
    'nih.gov',
    'www.nhs.uk'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'government'
  and lower(domains.hostname) in (
    'epa.gov',
    'irs.gov',
    'justice.gov',
    'nasa.gov',
    'nist.gov',
    'noaa.gov',
    'state.gov',
    'un.org',
    'usda.gov',
    'whitehouse.gov',
    'www.gov.br',
    'www.gov.pl',
    'www.gov.uk',
    'www.usa.gov'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'education'
  and lower(domains.hostname) in (
    'berkeley.edu',
    'code.org',
    'columbia.edu',
    'cornell.edu',
    'harvard.edu',
    'kahoot.com',
    'loc.gov',
    'mit.edu',
    'princeton.edu',
    'stanford.edu',
    'ucla.edu',
    'umich.edu',
    'usc.edu',
    'washington.edu',
    'yale.edu'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'travel'
  and lower(domains.hostname) in (
    'booking.com',
    'delta.com',
    'makemytrip.com',
    'ryanair.com',
    'trip.com',
    'tripadvisor.com',
    'united.com'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'technology'
  and lower(domains.hostname) in (
    'amazonaws.com',
    'chatgpt.com',
    'cloudinary.com',
    'developer.mozilla.org',
    'digicert.com',
    'docker.com',
    'github.com',
    'gitlab.com',
    'google.com',
    'grammarly.com',
    'intel.com',
    'microsoft.com',
    'nvidia.com',
    'openstreetmap.org',
    'semgrep.dev',
    'sentry.io',
    'shopify.com',
    'termius.com',
    'ui.com',
    'wordpress.com',
    'wordpress.org',
    'zoom.us'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'entertainment'
  and lower(domains.hostname) in (
    'discovery.com',
    'epicgames.dev',
    'ferrari.com',
    'formula1.com',
    'gamepass.com',
    'hbo.com',
    'netflix.com',
    'roblox.com',
    'sonypictures.com',
    'spotify.com',
    'starz.com',
    'surfline.com',
    'xboxlive.com',
    'youtube.com'
  );

update public.domains as domains
set industry_primary_id = industries.id
from public.industries
where industries.slug = 'social'
  and lower(domains.hostname) in (
    'discord.com',
    'facebook.com',
    'instagram.com',
    'pinterest.com',
    'reddit.com',
    'snapchat.com',
    'tiktok.com',
    'twitter.com',
    'wa.me',
    'whatsapp.com',
    'x.com'
  );
