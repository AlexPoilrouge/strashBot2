### INFO

Bot made for a local Discord server.
Can (non-exhaustively):
* Add specific role to a user that reacts with a specific emoji to a specific message
* Respond to some command under format `!command`
Bot written in node.js.



### Dependencies

#### install

* ansible
* python-setuptools
* make
* yq

#### Run

* npm
* Node.js
* discord.js
* plus all the node packages listed in `package.json`


### Install and use

#### Create and invite Bot

Check out Discord's documentation for how to [create a bot account](https://discordpy.readthedocs.io/en/rewrite/discord.html) for your server.
Once it's done, invite the bot to the server (only possible by user with "manager server" permission) by using a link formatted as follow:
`https://discordapp.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=PERMISSION_INTEGER`
Where `YOUR_CLIENT_ID` can be found on the [discord application page](https://discordapp.com/developers/applications), and the `PERMISSION_INTEGER` can also be computed from there ('Bot' section).

**Be sure to note your bot's `TOKEN` from the bot section.**


#### ansible stuff

Bot deployment (distant machin) or installation (locally) now use ansible in any case.

Configuration is done by providing the [playbook](config/ansible/playbook.yaml) with
apporpriate *variable* files.
See [variables.yaml](config/ansible/variables.yaml) as an example.

##### deployment

You can use make as a quick deployment, but an `inventory.yaml` for distant machines,
and a `variables.yaml` for config still have to be provided.

```bash
cd config/ansbile
make remote_install ANSIBLE_INVENTORY="/path/to/variables.yaml" ANSIBLE_VARIABLES="/path/to/inventory.yaml"
```

Here's an example for the `inventory.yaml`:

```yaml
all:
  hosts:
    my_serv:
      ansible_host: any_address.ok
      ansible_user: ansible
      ansible_ssh_private_key_file: ~/.ssh/strashbot_ansible
```

##### local install

You can use the install script `install.sh` to install locally (still using ansible),
but a `variables.yaml` files is still need for configuration.

```bash
./install.sh -v /path/to/variables.yaml
```

##### slash commands

Given that in the config provided by `variables.yaml`, the discord bot info are correctly set,
if the `discord_bot.register_slash` is set to `true`, the bot's slash commands will be
registered on install (as global, or only for the 'dev guild' if `discord_bot.debug` is
set to `true`).

Deleting slash commands can be done on install (before commands registration), by providing
a [slash_delete.json](extras/slash_delete.json) file filed correctly.
Here's an example:

```json
{
    "global": "all",
    "1234567891234567891": [ "7412589633698521477", "9874563211236547899" ]
}
```
With this (and`discord_bot.register_slash` set to `true`), all the global commands
for the bot will be deleted, and the commands ID'd `7412589633698521477` & `9874563211236547899`
on the guild that has `1234567891234567891` for ID will also be deleted.

### Run

The bot can be configured and installed to work with systemd, in which case:
```bash
systemctl start strashbot.service
```

Otherwise, just run the launch script:
```bash
./launch.sh
```


### Misc.

#### Persistent Data

To work properly, this bot saves configuration data on the disk as **persistent data**.
This data is stored under `JSON` format, in the following manner:
* global configuration data will be saved in: `data/guildConfigs.json`
* data generated and accessed by specific bot-modules are stored per module per guild under `data/commands/{name}_{guild_id}.json`.

#### Bot-modules

Bot-modules are code that is loaded dynamicaly during the bot's launch.
These modules are located is the `js/commands` folder the following name format: `cmd_{name}.js`.
In order for a module to work, it must fulfill certain requirements; check `js/commands/cmd_template.js` for a
minimalistic example.



### Release and use

This bot was made for personal needs and use. The code is release on the
off chance it might be of use to someone but without the intention of providing
any form of utility software or service in a rigorous manner.
Therefore, **no support** is endorsed by the developer, meaning that **any
comment, feedback, or request regarding this code should be expected to be completely
ignored by the developer**.
Additionally, the responsibility of any undesired effect the execution of this
bot might have on any system lies solely in the hands of the user.


*From Strasbourg,
with love.*

