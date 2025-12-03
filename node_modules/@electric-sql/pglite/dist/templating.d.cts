declare const TemplateType: {
    readonly part: "part";
    readonly container: "container";
};
interface TemplatePart {
    _templateType: typeof TemplateType.part;
    str: string;
}
interface TemplateContainer {
    _templateType: typeof TemplateType.container;
    strings: TemplateStringsArray;
    values: any[];
}
interface TemplatedQuery {
    query: string;
    params: any[];
}
/**
 * Templating utility that allows nesting multiple SQL strings without
 * losing the automatic parametrization capabilities of {@link query}.
 *
 * @example
 * ```ts
 * query`SELECT * FROM tale ${withFilter ? sql`WHERE foo = ${fooVar}` : sql``}`
 * // > { query: 'SELECT * FROM tale WHERE foo = $1', params: [fooVar] }
 * // or
 * // > { query: 'SELECT * FROM tale', params: [] }
 * ```
 */
declare function sql(strings: TemplateStringsArray, ...values: any[]): TemplateContainer;
/**
 * Allows adding identifiers into a query template string without
 * parametrizing them. This method will automatically escape identifiers.
 *
 * @example
 * ```ts
 * query`SELECT * FROM ${identifier`foo`} WHERE ${identifier`id`} = ${id}`
 * // > { query: 'SELECT * FROM "foo" WHERE "id" = $1', params: [id] }
 * ```
 */
declare function identifier(strings: TemplateStringsArray, ...values: any[]): TemplatePart;
/**
 * Allows adding raw strings into a query template string without
 * parametrizing or modifying them in any way.
 *
 * @example
 * ```ts
 * query`SELECT * FROM foo ${raw`WHERE id = ${2+3}`}`
 * // > { query: 'SELECT * FROM foo WHERE id = 5', params: [] }
 * ```
 */
declare function raw(strings: TemplateStringsArray, ...values: any[]): TemplatePart;
/**
 * Generates a parametrized query from a templated query string, assigning
 * the provided values to the appropriate named parameters.
 *
 * You can use templating helpers like {@link identifier} and {@link raw} to
 * add identifiers and raw strings to the query without making them parameters,
 * and you can use {@link sql} to nest multiple queries and create utilities.
 *
 * @example
 * ```ts
 * query`SELECT * FROM ${identifier`foo`} WHERE id = ${id} and name = ${name}`
 * // > { query: 'SELECT * FROM "foo" WHERE id = $1 and name = $2', params: [id, name] }
 * ```
 */
declare function query(strings: TemplateStringsArray, ...values: any[]): TemplatedQuery;

export { identifier, query, raw, sql };
