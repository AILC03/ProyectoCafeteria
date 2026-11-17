import { z } from 'zod';
export { pageQuerySchema as historyQuery } from '../../shared/http/pagination.js';
export const profileQuery = z.object({}).strict();
export { idSchema as resourceId } from '../../shared/http/pagination.js';
