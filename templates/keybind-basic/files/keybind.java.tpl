package {{package}}.client;

import net.minecraft.client.KeyMapping;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;

/** {{displayName}} 热键骨架。 */
public final class {{ClassName}}Keybind {
    private {{ClassName}}Keybind() {}

    public static final KeyMapping KEY = new KeyMapping(
        "key.{{modid}}.{{id}}",
        org.lwjgl.glfw.GLFW.GLFW_KEY_{{key}},
        "key.categories.{{modid}}");

    public static void onRegisterKeyMappings(RegisterKeyMappingsEvent event) {
        event.register(KEY);
    }
}
