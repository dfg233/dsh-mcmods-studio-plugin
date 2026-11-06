package {{package}}.network;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/** {{ClassName}} 包在客户端的处理。 */
public final class {{ClassName}}Handler {
    private {{ClassName}}Handler() {}

    public static void handle(String message) {
        Minecraft.getInstance().execute(() -> {
            if (Minecraft.getInstance().player != null) {
                Minecraft.getInstance().player.displayClientMessage(Component.literal(message), false);
            }
        });
    }
}
