import { createAdminHandler } from './admin.js';
import { createBillingService } from '../server/billing.mjs';
import { ChatError } from '../server/ai-access.mjs';
export default createAdminHandler(async (authorization,body)=>{
  try { return await createBillingService().service(authorization,body); }
  catch(error) { if(error instanceof ChatError)throw error;throw new ChatError(503,'billing_unavailable','Billing is unavailable. Check the test configuration and retry.'); }
});
