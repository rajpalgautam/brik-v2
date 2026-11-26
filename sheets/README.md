# Set up Brik with Google Sheets

1. Create a blank Google Sheet named Brik. Open Extensions → Apps Script.
2. Paste Code.gs into the existing script file. Click + → HTML, name it Index, and paste Index.html into it. Save both.
3. Select setup at the top of the editor and click Run. Approve Google’s access request. A tab named Brik Projects should appear in the sheet.
4. Click Deploy → New deployment → Web app. Choose to execute as the user accessing the web app. Choose Only myself for a personal workspace if available, or restrict the audience to signed-in users. Deploy and open the web app URL ending in /exec.
5. Add a project, reload the page, edit its status, and check that the same spreadsheet row updated. Keep the heading row and the ID and Updated columns intact. Use the app to edit while others are working.
6. Optional team use: everyone sees the same project list. Give each teammate Editor access to this dedicated spreadsheet and allow their signed-in account in the deployment audience. Each teammate authorizes the app when opening it.

The Google URL works by itself. To use the existing Vercel homepage, merge the included app/page.tsx change into your GitHub repo, set BRIK_SHEETS_APP_URL to the /exec URL in Vercel's production environment, and redeploy. The original workspace is still available with its original Supabase setup. This lightweight workspace starts empty and does not import earlier data or supply per-project roles, file storage, team chat, AI or public showcases.
