from services.content.handlers import ContentHandler, DEFAULT_HANDLERS


class HandlerRegistry:
    def __init__(self, handlers: tuple[ContentHandler, ...] = DEFAULT_HANDLERS):
        self._handlers: dict[str, ContentHandler] = {}
        for handler in handlers:
            self.register(handler)

    def register(self, handler: ContentHandler) -> None:
        self._handlers[handler.subtype] = handler

    def get(self, subtype: str) -> ContentHandler:
        return self._handlers.get(subtype, self._handlers["speech"])

