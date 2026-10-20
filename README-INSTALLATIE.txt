Football-Shirt-Market — AI visual search update

Files in this ZIP:
- server.js: updated backend
- index.html: updated website frontend
- image-index-admin.html: admin page for indexing existing shirt photos
- package.json: existing project package configuration

Installation:
1. Make a backup of your current files first.
2. Replace server.js and index.html in your project with the files from this ZIP.
3. Add image-index-admin.html to the same project root as server.js.
4. Keep your existing package.json if it contains dependencies/configuration newer than the one in this ZIP; compare before replacing.
5. Configure required secrets on Render only (never in frontend code), including SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GROQ_VISION_MODEL, and IMAGE_ANALYSIS_ADMIN_KEY as required by the updated server.
6. Deploy and test before using on the live site.

Note: The files have been packaged with their intended filenames. They have not been live-tested against your Render/Supabase project.
