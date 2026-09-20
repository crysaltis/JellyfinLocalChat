using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace JellyfinLocalChat;

public sealed class ChatService
{
    private const int MaxStoredMessages = 1000;

    private readonly string _filePath;
    private readonly object _sync = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public ChatService(string dataPath)
    {
        var directory = Path.Combine(dataPath, "NabrisChat");
        Directory.CreateDirectory(directory);

        _filePath = Path.Combine(directory, "chat.json");

        if (!File.Exists(_filePath))
        {
            File.WriteAllText(_filePath, "[]");
        }
    }

    public IReadOnlyList<ChatMessage> GetMessages(int limit = 200)
    {
        lock (_sync)
        {
            return LoadMessages()
                .TakeLast(limit)
                .ToList();
        }
    }

    public ChatMessage AddMessage(string username, string text)
    {
        lock (_sync)
        {
            var messages = LoadMessages();

            var message = new ChatMessage
            {
                Username = username,
                Message = text.Trim(),
                Timestamp = DateTimeOffset.UtcNow
            };

            messages.Add(message);

            if (messages.Count > MaxStoredMessages)
            {
                messages = messages
                    .TakeLast(MaxStoredMessages)
                    .ToList();
            }

            SaveMessages(messages);

            return message;
        }
    }

    public bool DeleteMessage(Guid id, string username, bool isAdministrator)
    {
        lock (_sync)
        {
            var messages = LoadMessages();

            var message = messages.FirstOrDefault(x => x.Id == id);

            if (message is null)
            {
                return false;
            }

            if (!isAdministrator &&
                !string.Equals(
                    message.Username,
                    username,
                    StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            message.Deleted = true;
            message.Message = string.Empty;

            SaveMessages(messages);

            return true;
        }
    }

    private List<ChatMessage> LoadMessages()
    {
        var json = File.ReadAllText(_filePath);

        return JsonSerializer.Deserialize<List<ChatMessage>>(
                   json,
                   JsonOptions)
               ?? new List<ChatMessage>();
    }

    private void SaveMessages(List<ChatMessage> messages)
    {
        var json = JsonSerializer.Serialize(messages, JsonOptions);

        var tempPath = _filePath + ".tmp";

        File.WriteAllText(tempPath, json);

        File.Move(tempPath, _filePath, true);
    }
}
