using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using System;

namespace JellyfinLocalChat;

public sealed class Plugin : BasePlugin<PluginConfiguration>
{
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Nabris Chat";

    public override Guid Id =>
        Guid.Parse("b3d8b5a2-7c2c-4a5a-9d52-111111111111");
}

public sealed class PluginConfiguration : BasePluginConfiguration
{
}
