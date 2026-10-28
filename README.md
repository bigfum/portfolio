# bigfum.dev

My personal portfolio site, live at [bigfum.dev](https://bigfum.dev). I designed and built it from scratch, without a UI framework or template.

## Built with

- **[Astro](https://astro.build)** for static pages and view transitions
- **Plain CSS**: one stylesheet with theme variables for light and dark mode
- **Cloudflare** for hosting and DNS

## Highlights

- **Accessibility:** scored 99/100 in a Lighthouse audit, with ARIA labels throughout and support for reduced motion
- **Theming:** light and dark mode that follow the system setting and remember your choice
- **Performance:** self-hosted fonts, an eagerly loaded LCP image and no font flash on load

## Running it locally

Requires Node 22.12 or newer.

```sh
npm install
npm run dev       # dev server at http://localhost:4321
npm run build     # production build in ./dist
npm run preview   # serve the production build
```

## Structure

```
src/
  layouts/BaseLayout.astro   sidebar, theme toggle and page shell
  pages/                     home, projects (wip), toys (wip) and contact
  styles/style.css           all site styles
public/
  scenes/                    Three.js background scenes
  fonts/                     self-hosted Eurostile
```