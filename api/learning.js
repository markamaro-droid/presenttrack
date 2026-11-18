import {createHandler} from './chat.js';
import {createLearningService} from '../server/learning.mjs';
export default createHandler(createLearningService());
