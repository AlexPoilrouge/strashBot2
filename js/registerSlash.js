const { REST, Routes, Client } = require('discord.js');

const config= require('config');

const fs = require('node:fs');
const path= require( 'path' );

let hereLog=    (...args) => {console.log("[registerSlash]", ...args);};

const modules_dir= "./modules"

const commands = [];

let clientId= config.get('StrashBot.clientID')
let devGuildId= config.get('StrashBot.devGuildID')
let token= config.get('StrashBot.token')
let debug= ["1","on","true","debug"].includes(config.get('StrashBot.debug').toLowerCase());



let dir_path= path.resolve(__dirname, modules_dir)
fs.mkdirSync(dir_path, { recursive: true });
// Grab all the command files from the commands directory you created earlier
const commandFiles = fs.readdirSync(dir_path).filter(file => file.startsWith('mod_') && file.endsWith('.js'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
	const command = require(`${dir_path}/${file}`);
	hereLog(`Processing file: ${file}`)

	let slash_builders= command.slash_builders;

	if(Boolean(command) && ((!Boolean(command.devOnly)) || Boolean(debug))){
		if(Array.isArray(slash_builders)){
			for(var sb of slash_builders){
				hereLog(`--> Slashbuilder found: ${Boolean(sb && sb.data)?sb.data.name: 'Unknown / Unnamed ?(?!)'}`)
				hereLog(`-- --> added! ${Boolean(command.devOnly)?'[devOnly]':''}`)
				commands.push(sb.data.toJSON())
			}
		}
		else{
			hereLog(`--> Slashbuilder found: ${Boolean(slash_builders.data)?slash_builders.data.name: 'Unknown / Unnamed ?(?!)'}`)
			hereLog(`-- --> added! ${Boolean(command.devOnly)?'[devOnly]':''}`)
			commands.push(slash_builders.data.toJSON());
		}
	}
	else{
		hereLog(`--> no add… ${((!Boolean(debug)) && Boolean(command.devOnly))?`[devOnly]`:''}`)
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
let deploySlash= (async (g_id=undefined) => {
	try {
		hereLog(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set

		let data= undefined
		if(Boolean(g_id)){
			data = await rest.put(
				Routes.applicationGuildCommands(clientId, g_id),
				{ body: commands }
			);

			hereLog(`Successfully reloaded ${data.length} application (/) commands for guild ${g_id}.`);
		}
		else{
			data = await rest.put(
				Routes.applicationCommands(clientId),
				{ body: commands }
			);

			hereLog(`Successfully reloaded ${data.length} application (/) commands for all guilds.`);
		}
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
});


const DISCORD_ID_REGEX=/^\d{17,19}$/

let deleteSlash= async (cmd_pointer, g_id= undefined) => {
	var cmd_list= undefined
	if((typeof cmd_pointer)==='string'){
		if(cmd_pointer.toLowerCase()==='all'){
			cmd_list= []
		}
		else if(DISCORD_ID_REGEX.test(cmd_pointer)){
			cmd_list= [ cmd_pointer ]
		}
	}
	else if(Array.isArray(cmd_pointer)){
		if(cmd_pointer.length<=0){
			hereLog(`nothing to remove…	`)

			return
		}

		cmd_list= cmd_pointer
	}

	if(!Boolean(cmd_list)){
		hereLog(`Unrecognized pointer "${cmd_pointer}"…`)
		return
	}

	if(cmd_list.length>0){
		for(var cmd_id of cmd_list){
			try{
				hereLog(`Removing ${g_id ?? 'global'} command ${cmd_id}…`)
				if(Boolean(g_id)){
					await rest.delete(Routes.applicationGuildCommand(clientId, guildId, cmd_id))
				}
				else{
					await rest.delete(Routes.applicationCommand(clientId, cmd_id))
				}
				hereLog(`Successfully deleted application (/) ${g_id ?? 'global'} command '${cmd_id}'.`);
			} catch(err){
				hereLog(`Error deleting ${cmd_id} ${g_id ?? 'global'} command - ${err}`)
			}
		}
	}
	else{
		try{
			hereLog(`Removing all ${g_id ?? 'global'} commands…`)
			if(Boolean(g_id)){
				await rest.put(
					Routes.applicationGuildCommands(clientId, g_id),
					{ body: [] }
				);
			}
			else{
				await rest.put(Routes.applicationCommands(clientId),
					{ body: []}
				);
			}
			hereLog(`Successfully deleted all application (/) ${g_id ?? 'global'} commands.`);
		} catch(err){
			hereLog(`Error deleting all ${g_id ?? 'global'} commands - ${err}`)
		}
	}
}

async function delete_allSlashes_fromFile(filepath) {
	try {
		// Read the JSON file synchronously
		const data = fs.readFileSync(filepath, 'utf8');
		
		// Parse the JSON data
		const jsonData = JSON.parse(data);
		
		// Iterate over each first-level key in the JSON file
		for (const key in jsonData) {
			try{
				if (jsonData.hasOwnProperty(key)) {
					// Call treatment function with the object
					if(key.toLocaleLowerCase()==="global"){
						hereLog(`Removing global commands…`)
						await deleteSlash(jsonData[key])
					}
					else if(DISCORD_ID_REGEX.test(key)){
						hereLog(`Removing guild commands for guild ${key} …`)
						await deleteSlash(jsonData[key], key)
					}
					else{
						hereLog(`'${key}' not a guild id, and not accepted`)
					}
				}
			} catch(err){
				hereLog(`Error for ${key} command deletion… - ${err}`)
			}
		}
	} catch (err) {
		console.error('Error reading or parsing file:', err);
	}
}

const SLASH_DELETE_FILE="../slash_delete.json"

let main= async () => {
	await delete_allSlashes_fromFile(path.join(__dirname, SLASH_DELETE_FILE))

	if(commands.length>0){
		if(Boolean(debug)){
			await deploySlash(devGuildId)
		}
		else{
			await deploySlash()
		}
	}
	else{
		hereLog(`No modules found to add…`)
	}
}


main()
