package {{package}}.command;

import com.mojang.brigadier.CommandDispatcher;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraftforge.event.RegisterCommandsEvent;

/** {{displayName}} 命令注册骨架。 */
public final class {{ClassName}}Command {
    private {{ClassName}}Command() {}

    public static void onRegisterCommands(RegisterCommandsEvent event) {
        CommandDispatcher<CommandSourceStack> dispatcher = event.getDispatcher();
        dispatcher.register(Commands.literal({{commandName}})
            .executes(context -> {
                // TODO: 命令逻辑
                return 1;
            }));
    }
}
