import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { SupabaseService } from './supabase.service';
import { ImageService } from './image.service';

import { Client, CommandInteraction, Intents, MessageAttachment, MessageEmbed, Permissions } from 'discord.js';
import { firstValueFrom } from 'rxjs';

import { Message } from 'src/interfaces/message.interface';

import dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class DiscordService {
  private readonly client: Client;

  constructor(
    private readonly http: HttpService,
    private readonly supaSvc: SupabaseService,
    private imgSvc: ImageService
  ) {
    this.client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });
    this.initializeBot();
    this.registerSlashCommands();
  }
  
  // Initialize the bot
  async initializeBot() {
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}!`);
    });
  
    this.client.login(process.env.DISCORD_BOT_TOKEN);
  
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;
  
      if (interaction.commandName === 'setchannel') {
        await this.setDesignatedChannel(interaction);
      }
    });

    // this.testMessage();
  }

  // Set the designated channel for the bot to post in
  async setDesignatedChannel(interaction: CommandInteraction<any>) {
    
    if (!interaction.member) return;

    const member = interaction.member;
    if (!('permissions' in member)) return;

    const memberPermissions = member.permissions instanceof Permissions ? member.permissions : new Permissions();
    if (!memberPermissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
      await interaction.reply({
        content: 'You do not have the required permissions to set the designated channel.',
        ephemeral: true,
      });
      return;
    }
  
    const channelId = interaction.channelId;
    const serverId = interaction.guildId;

    await this.supaSvc.setChannelForServer(serverId, channelId);

    console.log({ channelId, serverId });
  
    await interaction.reply({
      content: 'Designated channel set successfully!',
      ephemeral: true,
    });
  }

  async postMessage(data: Message) {

    const channels = await this.supaSvc.getAllChannels();

    // Create the attachment
    const imageBuffer = Buffer.from(data.image.base64, 'base64');
    const attachment = new MessageAttachment(imageBuffer, `${data.phunkId}.png`);

    // Create the embed
    const embed = new MessageEmbed()
      .setColor(`#${data.image.color}`)
      .setImage(`attachment://${data.phunkId}.png`)
      .addFields({
        name: data.title,
        value: `\`\`\`${data.text}\`\`\``,
        inline: true
      });

    // Loop through all channels and send the message
    for (const channelId of channels) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (channel?.isText()) {
          await channel.send({ embeds: [embed], files: [attachment] });
        } else {
          console.error(`Channel with ID ${channelId} not found or not a text channel.`);
        }
      } catch (error) {
        console.error(`Error sending message to channel with ID ${channelId}:`, error);
      }
    }
  }

  // This only needs to be run once to register the slash commands
  async registerSlashCommands() {
    const commands = [
      {
        name: 'setchannel',
        description: 'Set the designated channel for the bot to post in',
      },
    ];
  
    try {
      console.log('Started refreshing application (/) commands.');
  
      const url = `https://discord.com/api/v9/applications/${process.env.DISCORD_CLIENT_ID}/commands`;
      const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  
      await firstValueFrom(this.http.put(url, commands, { headers }));
  
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
  }

  // async testMessage() {
  //   const image = await this.imgSvc.createImage('1060');
  //   const title = `📢 Phunk #1060 has been put up for auction!`;
  //   const text = `Started by: chopperdad.eth\nAuction Ends: ${new Date().toUTCString()}\n\nTime remaining:\n0 days\n0 hours\n0 minutes\n0 seconds`;

  //   this.postMessage({ text, title, image, phunkId: '1060' });
  // }
  
}