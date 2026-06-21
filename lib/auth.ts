import { NextRequest } from 'next/server';

export function requireAdmin(req: NextRequest) {
  const pin = req.headers.get('x-admin-pin');
  const expected = process.env.ADMIN_PIN;
  return Boolean(expected && pin && pin === expected);
}
