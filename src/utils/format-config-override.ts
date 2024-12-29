/* eslint-disable perfectionist/sort-object-types */

export function formatConfigOverride(input: {file: string; section: string; key: string; value: string}) {
  return `-ini:${input.file}:[${input.section}]:${input.key}=${input.value}`
}
