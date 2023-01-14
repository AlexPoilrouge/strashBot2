To add a template for the top8gen module, follow the following steps:


##### 1. ADD A DIRECTORY

create a new directory in the current one

##### 2. ADD A GENERATE.JS SCRIPT

In the newly created directory, create a new node js scripte called `generate.js`

This new script must contain at leat two functions:
    1. the `generateSVG` function
    2. the `post_generate` function

###### `generateSVG()`

`async function generateSVG(infos, rasterizeFunc, resultMsgSend= undefined)`

This function is used to creat a new svg files that displays the top8;

The `generateSVG` function takes the following arguments:
    `infos` - an object that has the following attributes:
            `destination_dir` - the directory path for where the final render will be generate
            `title` - the title displayed in the render
            `top8` - an array (sorted according to winning order) of objects with the following attributes:
                    `name` - the name of the player
                    `twitter` - the twitter of the player
                    `roster` - an array containing string representing the player's roster. Said strings are formatted as follow:
                            "[characterNumber].[skinNumber]"
    `rasterizeFunc` - a function that rasterize a given svg file into a png with the following signature
            `(svg, outputPng) => boolean` - where:
                    `svg` is a string containing the path of the png to rasterize
                    `outputPng` the path where the png will pe generated
            returns a boolean designating the success of the rasterizing or not
    `resultMsgSend` - a function that should be called whenener the user need to informed with a particular message. Signature:
            `(msg) => undefined` - where:
                    `msg` is a string containing the message to show to the user.

    returns a object build with attributes as follow:
            `is_success` - boolean depending on the success of the method
            `preparation` - stringmessage in case of failure in the preparation of resources (empty if no failure)
            `read` - string message in case of failure in the reading of pre-existing resources (empty if no failure)
            `acquisition` - string message in case of failure in obtaining (dl?) pre-existing resources (empty if no failure)
            `ressource_copy` - object containing infos about the copy and preparation of available resources. Attributes as follow:
                    `char_img` - string message in case of failure in copying characters images resources (empty if no failure)
                    `stock_img` - string message in case of failure in copying stock images resources (empty if no failure)
                    `base_img` - string message in case of failure in copying non variable pre-existing resources (empty if no failure)
            `generation` - string message in case of failure in generating the svg
            `out_svg` - string containing the path of the generated svg (empty if failure)
            `final_png` - string containing the path of the rasterized svg as a png image file

            `newfiles` - generated files that are to be utlimately deleted

this function should be made available for the calling script with the following line:
`module.exports.generateSVG= generateSVG`


###### `post_generate()`

`function post_generate(destination_dir, zip_func, additional_files_to_delete)`

This function is for cleaning up the file system of all the files no longer needed after the call to `generateSVG()` has been made

The `post_generate` function takes the following arguments:
    `destination_dir` - a string representing the path to the directory in which the files were previously generated
    `zip_func` - a function that comrpress given files into a given archive, with the following signature:
            `(files, destination) => boolean` - where:
                    `files` - is a list (Array) of string that containts the path pointing to all the files to compress into the archive
                    `destination` - the path of the newly created archive
            returns a boolean depending on the success of the rasterization
    `additional_files_to_delete` - a list (Array) of string containing additionnal but variable files to delete

    returns a boolean depending on the function's success

this function should be made available for the calling script with the following line:
`module.exports.post_generate= post_generate;`