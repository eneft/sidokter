import handleVercelAuthProxy from '../_authProxy';

export default async function handler(req: any, res: any) {
  return handleVercelAuthProxy(req, res);
}
