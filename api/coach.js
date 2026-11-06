import { createHandler } from './chat.js';
import { createCoachService } from '../server/coach.mjs';
export default createHandler(createCoachService());
