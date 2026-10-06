import type { Request, Response } from 'express';
import type { CategoryActivityListQuery, CategoryActivityParams } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { readCategories } from '../application/readCategories.js';
import { readCategory } from '../application/readCategory.js';

export async function listCategoryActivityHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(
      await readCategories(validatedQuery<CategoryActivityListQuery>(req), actorContextFrom(req)),
    );
}
export async function getCategoryActivityHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await readCategory(validatedParams<CategoryActivityParams>(req), actorContextFrom(req)));
}
