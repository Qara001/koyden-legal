// file: scripts/build.mjs
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const paths = {
    template: path.join(root, "src", "templates", "legal-page.html"),
    contentDir: path.join(root, "src", "content"),
    outDir: path.join(root, "public"),
};

const languages = ["en", "fr", "nl"];

// Basic markdown-to-html (enough for legal docs: headings, paragraphs, lists, bold/italic, links)
function mdToHtml(md) {
    let s = md.replace(/\r\n/g, "\n");

    // Escape HTML to avoid accidental raw tags
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`);

    // Bold **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, `<strong>$1</strong>`);
    // Italic *text*
    s = s.replace(/\*([^*]+)\*/g, `<em>$1</em>`);

    // Headings
    s = s.replace(/^### (.*)$/gm, `<h3>$1</h3>`);
    s = s.replace(/^## (.*)$/gm, `<h2>$1</h2>`);

    // Lists
    // Convert consecutive "- " lines into <ul><li>...</li></ul>
    s = s.replace(
        /(?:^|\n)(- .*(?:\n- .*)*)/g,
        (match) => {
            const items = match
                .trim()
                .split("\n")
                .map((line) => line.replace(/^- /, "").trim())
                .filter(Boolean);

            if (!items.length) return match;

            return `\n<ul>\n${items.map((it) => `  <li>${it}</li>`).join("\n")}\n</ul>\n`;
        }
    );

    // Paragraphs: split by blank lines
    const blocks = s
        .split(/\n{2,}/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => {
            if (b.startsWith("<h2>") || b.startsWith("<h3>") || b.startsWith("<ul>")) return b;
            return `<p>${b.replace(/\n/g, "<br/>")}</p>`;
        });

    return blocks.join("\n");
}

function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}

function readFile(p) {
    return fs.readFileSync(p, "utf8");
}

function writeFile(p, data) {
    ensureDir(path.dirname(p));
    fs.writeFileSync(p, data, "utf8");
}

function slugFromFilename(filename) {
    return filename.replace(/\.md$/, "");
}

function titleFromSlug(lang, slug) {
    const map = {
        en: { privacy: "Privacy Policy", terms: "Terms of Service" },
        fr: { privacy: "Politique de confidentialité", terms: "Conditions d’utilisation" },
        nl: { privacy: "Privacybeleid", terms: "Gebruiksvoorwaarden" },
    };
    return map[lang]?.[slug] ?? slug;
}

function descriptionFromSlug(lang, slug) {
    const map = {
        en: { privacy: "How we collect and use data.", terms: "Rules for using Koyden." },
        fr: { privacy: "Comment nous collectons et utilisons les données.", terms: "Règles d’utilisation de Koyden." },
        nl: { privacy: "Hoe wij gegevens verzamelen en gebruiken.", terms: "Regels voor het gebruik van Koyden." },
    };
    return map[lang]?.[slug] ?? "";
}

function uiLabels(lang) {
    const map = {
        en: { navTerms: "Terms", navPrivacy: "Privacy", footerContactLabel: "Contact" },
        fr: { navTerms: "Conditions", navPrivacy: "Confidentialité", footerContactLabel: "Contact" },
        nl: { navTerms: "Voorwaarden", navPrivacy: "Privacy", footerContactLabel: "Contact" },
    };
    return map[lang] ?? map.en;
}

// Put your real last updated date here (or later automate from git)
const LAST_UPDATED = "January 7, 2026";

function render(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function build() {
    const template = readFile(paths.template);

    for (const lang of languages) {
        const langDir = path.join(paths.contentDir, lang);
        const outLangDir = path.join(paths.outDir, lang);

        if (!fs.existsSync(langDir)) {
            console.warn(`Missing content dir: ${langDir}`);
            continue;
        }

        ensureDir(outLangDir);

        const mdFiles = fs.readdirSync(langDir).filter((f) => f.endsWith(".md"));

        for (const mdFile of mdFiles) {
            const slug = slugFromFilename(mdFile); // privacy | terms
            const mdPath = path.join(langDir, mdFile);
            const md = readFile(mdPath);

            const htmlContent = mdToHtml(md);

            const labels = uiLabels(lang);

            const vars = {
                lang,
                slug,
                langUpper: lang.toUpperCase(),

                title: titleFromSlug(lang, slug),
                description: descriptionFromSlug(lang, slug),
                lastUpdated: LAST_UPDATED,

                // UI labels (template placeholders)
                navTerms: labels.navTerms,
                navPrivacy: labels.navPrivacy,
                footerContactLabel: labels.footerContactLabel,

                // nav active states
                termsActive: slug === "terms" ? "active" : "",
                privacyActive: slug === "privacy" ? "active" : "",
                enActive: lang === "en" ? "active" : "",
                frActive: lang === "fr" ? "active" : "",
                nlActive: lang === "nl" ? "active" : "",

                contactEmail: "koyden.contact@gmail.com",
                content: htmlContent,
            };


            const finalHtml = render(template, vars);

            const outPath = path.join(outLangDir, `${slug}.html`);
            writeFile(outPath, finalHtml);

            // Also write pretty route files via Pages routing:
            // /en/privacy should work if you also create /en/privacy/index.html
            const prettyPath = path.join(outLangDir, slug, "index.html");
            writeFile(prettyPath, finalHtml);
        }
    }

    console.log("✅ Build complete: public/{lang}/{privacy|terms}.html and pretty routes.");
}

build();
