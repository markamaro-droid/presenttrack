import { createHandler } from './chat.js';
import { createVoiceService } from '../server/voice.mjs';
export default createHandler(createVoiceService());
