<!--
  README template for every download folder. Edit freely: this is plain Markdown.

  {{name}}                 inserts a value (list below). Unknown names are left as-is.
  {{#if flag}} … {{/if}}   shows the block only when the flag is on.
  {{#if flag}} … {{else}} … {{/if}}
                           same, with an alternative. Blocks cannot be nested.

  Values:  name, status, downloaded, listed, failed_count, started, updated,
           source_url, folder, page_size, batch_size, iiprop, extmetadata_filter, category_param, api_url,
           subcategory_count, subcategory_list, failed_list
  Flags:   has_subcategories, has_failed, listing_unfinished, not_done

  This comment is removed from the generated file.
-->
# {{name}}

Wikimedia Commons files, downloaded with CommonsFlow.

- **Status:** {{status}}
- **Downloaded:** {{downloaded}} of {{listed}}{{#if listing_unfinished}} listed so far{{/if}}{{#if has_failed}}, {{failed_count}} failed{{/if}}
- **Started / updated:** {{started}} / {{updated}}
- **Source:** <{{source_url}}>
{{#if has_subcategories}}- **Subcategories ({{subcategory_count}}):**
{{subcategory_list}}
{{/if}}
## Layout

This folder (`{{folder}}`) holds everything for this download:

```
{{folder}}/
├── README.md                       this file
├── files/
│   ├── 0000/                       media files, 1,000 per folder, in listing order
│   ├── 0001/
│   └── …
└── metadata/
    └── page-000001.ndjson          one JSON line per file, one file per API page
```

- File names are the Commons titles without `File:`. Unsafe characters become `_`, and an altered name gets `~<pageid>` before the extension.
- Each file has a `<file>.json` beside it with the same record as its metadata line.
- `metadata/*.ndjson` lines: `pageid`, `title`, `url` (download), `descriptionurl`, `descriptionshorturl` (file page), `size`, `sha1`, `user` (uploader) and `extmetadata` (`DateTime`, `DateTimeOriginal`, `License`, `LicenseShortName`, `LicenseUrl`, `AttributionRequired`).

## API calls

Public [Action API](https://www.mediawiki.org/wiki/API:Main_page), `format=json&formatversion=2`:

```
# 1. list files (repeat with the returned continue.cmcontinue)
{{api_url}}?action=query&list=categorymembers&cmtitle={{category_param}}&cmtype=file&cmsort=sortkey&cmlimit={{page_size}}[&cmcontinue=<token>]

# 2. metadata, up to {{batch_size}} page ids per call (extmetadata limited to the keys listed)
{{api_url}}?action=query&prop=imageinfo&pageids=<id1>|<id2>|…&iiprop={{iiprop}}&iiextmetadatafilter={{extmetadata_filter}}

# 3. download: GET the "url" from step 2 (size checked before saving)
```

## Licensing

Each file has its own license; check its Commons page before reuse (`https://commons.wikimedia.org/?curid=<pageid>`).

**Contributors must be credited** with a backlink, the user's name and the license. For each file, the `.json` next to it and its metadata line give you all three: `descriptionurl` (backlink to the file page), `user` (uploader) and `extmetadata` (`LicenseShortName`, `LicenseUrl`, `AttributionRequired`).
{{#if has_failed}}
## Failed files

{{failed_list}}

Use “Retry all” in CommonsFlow to retry.
{{/if}}{{#if not_done}}
## Resuming

Open CommonsFlow, log in, choose “Resume”. Finished files are skipped.
{{/if}}
