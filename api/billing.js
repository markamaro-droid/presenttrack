import { createAdminHandler } from './admin.js';
import { createBillingService } from '../server/billing.mjs';
export default createAdminHandler((authorization,body)=>createBillingService().service(authorization,body));
