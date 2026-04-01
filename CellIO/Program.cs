// ═══════════════════════════════════════════════════════════════════
// Program.cs — CELL.IO Game Server
// 
// Minimal ASP.NET Core application that serves the game's static
// files (HTML, CSS, JS) from the wwwroot folder.
// 
// Run with: dotnet run
// Then open: https://localhost:5001 (or the port shown in console)
// ═══════════════════════════════════════════════════════════════════

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// Serve index.html as the default document at "/"
app.UseDefaultFiles();

// Serve all static files from wwwroot (JS modules, CSS, assets)
app.UseStaticFiles(new StaticFileOptions
{
    ServeUnknownFileTypes = false,
    DefaultContentType = "application/octet-stream"
});

app.Run();
