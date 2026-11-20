import { z } from "zod";

/**
 * A public DTO is an explicit allowlist of fields copied from an internal
 * record shape. Fields are never removed by deny-listing: anything not named
 * in `fields` cannot reach a public response, including fields added to the
 * internal record later.
 */
export interface PublicDto<Shape extends z.ZodRawShape, Field extends keyof Shape & string> {
  readonly name: string;
  readonly fields: readonly Field[];
  readonly schema: z.ZodObject<Pick<Shape, Field>, z.core.$strict>;
  /** Project an internal record to its public form; missing or invalid allowlisted fields throw. */
  toPublic(record: { readonly [K in Field]?: unknown }): z.output<z.ZodObject<Pick<Shape, Field>, z.core.$strict>>;
}

export function definePublicDto<Shape extends z.ZodRawShape, const Field extends keyof Shape & string>(
  name: string,
  shape: Shape,
  fields: readonly Field[],
): PublicDto<Shape, Field> {
  if (new Set(fields).size !== fields.length) throw new Error(`Public DTO ${name} lists a field twice`);
  const picked: Partial<Record<Field, Shape[Field]>> = {};
  for (const field of fields) {
    if (!Object.hasOwn(shape, field)) throw new Error(`Public DTO ${name} names unknown field ${field}`);
    picked[field] = shape[field];
  }
  const schema = z.strictObject(picked as Pick<Shape, Field>);
  const frozenFields = Object.freeze([...fields]);
  return Object.freeze({
    name,
    fields: frozenFields,
    schema,
    toPublic(record: { readonly [K in Field]?: unknown }) {
      const projected: Record<string, unknown> = {};
      for (const field of frozenFields) {
        if (Object.hasOwn(record, field)) projected[field] = record[field];
      }
      return schema.parse(projected);
    },
  });
}
