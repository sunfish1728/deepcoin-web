import {build} from 'esbuild';
await build({entryPoints:['renderer/main.js'],bundle:true,minify:true,format:'iife',target:'chrome80',outfile:'public/avatar/stage.js'});
