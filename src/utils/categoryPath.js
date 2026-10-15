import { normalizeCategory } from '../api/commons';

/** "Category:Foo bar" (any spelling: spaces, underscores, lowercase "category:") → "Category:Foo_bar", the URL form Commons uses. */
export const categoryParam = (title) => normalizeCategory(title).replace(/ /g, '_');

/** The top category a job belongs to (its page is /Category:…). Jobs saved before `root` existed used the first category. */
export const jobRoot = (job) => job.root ?? job.categories[0];

/** A router location for the page of a category's download: `/Category:Foo_bar`. */
export const categoryLocation = (title) => ({ name: 'category', params: { category: categoryParam(title) } });
