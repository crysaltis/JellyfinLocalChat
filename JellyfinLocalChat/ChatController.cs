using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JellyfinLocalChat;

[ApiController]
[Route("NabrisChat")]
[Authorize]
public sealed class ChatController : ControllerBase
{
    private readonly ChatService _chatService;

    public ChatController(ChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet("Messages")]
    public ActionResult<IReadOnlyList<ChatMessage>> GetMessages(
        [FromQuery] int limit = 200)
    {
        limit = Math.Clamp(limit, 1, 500);

        return Ok(_chatService.GetMessages(limit));
    }

    [HttpPost("Messages")]
    public ActionResult<ChatMessage> SendMessage(
        [FromBody] SendMessageRequest request)
    {
        var username = User.Identity?.Name;

        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var text = request.Text?.Trim() ?? string.Empty;

        if (text.Length == 0)
        {
            return BadRequest(new
            {
                error = "Il messaggio non può essere vuoto."
            });
        }

        if (text.Length > 500)
        {
            return BadRequest(new
            {
                error = "Il messaggio non può superare 500 caratteri."
            });
        }

        var message = _chatService.AddMessage(username, text);

        return Ok(message);
    }

    [HttpDelete("Messages/{id:guid}")]
    public IActionResult DeleteMessage(Guid id)
    {
        var username = User.Identity?.Name;

        if (string.IsNullOrWhiteSpace(username))
        {
            return Unauthorized();
        }

        var isAdministrator = User.IsInRole("Administrator");

        var deleted = _chatService.DeleteMessage(
            id,
            username,
            isAdministrator);

        if (!deleted)
        {
            return Forbid();
        }

        return NoContent();
    }
}

public sealed class SendMessageRequest
{
    public string? Text { get; set; }
}
