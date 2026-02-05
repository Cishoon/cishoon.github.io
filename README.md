# Evolved Escape - Astro Blog Theme

> "Code with passion, design with soul."

This is a minimalist, engineering-aesthetic blog theme built with [Astro](https://astro.build) and [Tailwind CSS](https://tailwindcss.com). It embodies a design philosophy we call **"Ethereal Minimal"**.

## Design Philosophy

The core concept is **"Engineering Aesthetics" (工程美学)** — clean, precise, yet full of subtle details.

*   **Luminous Minimal (暗夜流光)**: The interface is not just a static page, but a breathing digital space. We use deep Zinc colors (`Zinc-950`) instead of pure black to create depth, overlaid with a subtle noise texture and ambient aurora gradients that shift slowly, mimicking the quiet atmosphere of late-night coding sessions.
*   **Interaction as Light**: Interaction is handled through light and physics, not just color changes.
    *   **Spotlight Effect**: A subtle glow follows your cursor, illuminating the underlying grid or card borders, like a flashlight exploring a blueprint.
    *   **Fluid Navigation**: The "Dynamic Island" navigation bar expands organically like liquid metal (`cubic-bezier` easing), revealing controls only when needed, maximizing screen real estate for content.
*   **Typographic Hierarchy**: Content is king. We use a carefully tuned typographic scale (`prose-zinc`) that ensures readability while maintaining a sophisticated, editorial look. Monospace fonts are used for metadata to reinforce the engineering vibe.
*   **Micro-Interactions**: Every transition is smoothed out. From the "typewriter" effect on the homepage to the magnetic hover effects on tags, every detail is crafted to provide a tactile, responsive feel.

## Tech Stack

*   **Framework**: Astro 5 (Zero JS by default, high performance)
*   **Styling**: Tailwind CSS v4 + @tailwindcss/typography
*   **Math**: KaTeX (via `remark-math` & `rehype-katex`) for beautiful LaTeX rendering.
*   **Transitions**: Astro View Transitions for SPA-like smooth navigation.
*   **Icons**: Heroicons (SVGs).

## Key Features

*   **Dynamic Island Navigation**: A top-centered, expandable pill navigation that houses links and a theme toggle.
*   **Immersive Hero Section**: Full-screen intro with a typewriter effect and scroll indicators.
*   **Timeline Archive**: A clean, chronological list of posts with sticky year headers.
*   **Floating Tag Cloud**: A 3D-like, floating tag cloud with focus effects.
*   **Dark/Light Mode**: Fully responsive theme switching that persists preference.
*   **SEO Ready**: Sitemap, meta tags, and semantic HTML.

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Start development server**:
    ```bash
    npm run dev
    ```

3.  **Build for production**:
    ```bash
    npm run build
    ```

## Customization

*   **Config**: Edit `astro.config.mjs` for site URL and integration settings.
*   **Styling**: Modify `src/styles/global.css` to tweak the CSS variables for colors and animations.
*   **Content**: Add Markdown or MDX files to `src/content/posts`.

---

**Stay Cool.**