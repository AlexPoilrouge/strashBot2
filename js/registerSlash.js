const { REST, Routes, Client } = require('discord.js');
// const { clientId, guildId, token } = require('./config.json');
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
				{ body: commands },
			);

			hereLog(`Successfully reloaded ${data.length} application (/) commands for guild ${g_id}.`);
		}
		else{
			data = await rest.put(
				Routes.applicationGuildCommands(clientId),
				{ body: commands },
			);

			hereLog(`Successfully reloaded ${data.length} application (/) commands for all guilds.`);
		}
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
});

if(Boolean(debug)){
	await deploySlash(devGuildId)
}
else{
	await deploySlash()
}
