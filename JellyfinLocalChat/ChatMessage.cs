using System;

namespace JellyfinLocalChat;

public sealed class ChatMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Username { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;

    public bool Deleted { get; set; }
}
