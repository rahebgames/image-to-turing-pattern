# Image to Turing Pattern

A program that uses the Gray-Scott model to create Turing patterns out of
cellular automata to look like an image. Inspired by
<https://youtu.be/7oCtDGOSgG8?si=jCOJRxqnMnAnsuGF>, a video demonstrating the
Turing patterns formed by blurring and sharpening an image repeatedly. I wanted
to achieve something similar using cellular automata, another form of simulating
a reaction-diffusion system. Additional credits and algorithms are mentioned
throughout the source code where applicable. This program was made as an
assignment for a college course.

This program heavily relies upon Amit Patel of Red Blob Games' source code
under: @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>.\
I discovered it through <https://www.redblobgames.com/x/2202-turing-patterns/>,
an article teaching Turing patterns. The original source code can be found here:
<https://www.redblobgames.com/x/2202-turing-patterns/reaction-diffusion.js>
Patel's source code was not left as-is in my program, with several modifications
made. First, I converted the JavaScript to TypeScript, a language I personally
prefer using. Next, the actual functionality was modified somewhat to allow a
mask for spatial varying of the feed rate, something required for my
implementation of image simulation. I also added numerous comments, as I was
previously unfamiliar with the grand majority of concepts required for this
program.

The majority of Patel's code is limited to the simulator.ts file, although some
of it is used as a base for parts of main.ts.
