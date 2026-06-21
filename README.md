# Prime Pulls Queue Starter

A minimal Shopify paid-order queue overlay for OBS.

## URLs
- `/admin` private dashboard
- `/overlay/queue` OBS browser source
- `/api/shopify/orders-paid` Shopify webhook endpoint

## Environment variables
Copy `.env.example` to `.env.local` locally, and add the same variables in Vercel.

## Supabase SQL
Run `supabase-schema.sql` in Supabase SQL Editor.

## Shopify webhook
Create webhook for Order payment / `orders/paid`, JSON format, URL:
`https://YOUR-VERCEL-APP.vercel.app/api/shopify/orders-paid`

## OBS
Add Browser Source with URL:
`https://YOUR-VERCEL-APP.vercel.app/overlay/queue`
Recommended size: 520x360.
