import { normalizeCategory } from '../api/commons';
import { parseCategory } from '../api/wiki';

/** "Category:Foo bar" (any spelling: spaces, underscores, lowercase "category:") → "Category:Foo_bar", the URL form Commons uses. */
export const categoryParam = (title) => normalizeCategory(title).replace(/ /g, '_');

/** The top category a job belongs to (its page is /Category:…). Jobs saved before `root` existed used the first category. */
export const jobRoot = (job) => job.root ?? job.categories[0];

/** A router location for the page of a category's download: `/Category:Foo_bar`. */
export const categoryLocation = (title) => ({ name: 'category', params: { category: categoryParam(title) } });

/** A category without its "Category:" and wiki prefixes: "Foo bar". */
export const categoryName = (title) => parseCategory(title).name;

/** A category for people to read: its name, preceded by the wiki when it is not Commons ("fr:wp:Foo bar"). */
export const categoryLabel = (title) => {
  const { prefix, name } = parseCategory(title);
  return prefix ? `${prefix}:${name}` : name;
};
