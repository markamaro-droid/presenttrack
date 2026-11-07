import { createHandler } from './chat.js';
import { createSpeechService } from '../server/speech.mjs';
export default createHandler(createSpeechService());
