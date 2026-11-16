package {{package}};

import com.mojang.logging.LogUtils;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import {{package}}.block.ModBlocks;
import {{package}}.blockEntity.ModBlockEntities;
import {{package}}.entity.ModEntities;
import {{package}}.item.ModCreativeModeTabs;
import {{package}}.item.ModItems;

/** {{name}} 的 Forge 入口：只做集中注册与事件订阅，内容注册在各自的 ModXxx 中。 */
@Mod({{ClassName}}.MODID)
public class {{ClassName}} {
    public static final String MODID = "{{modid}}";
    private static final Logger LOGGER = LogUtils.getLogger();

    public {{ClassName}}() {
        IEventBus modEventBus = FMLJavaModLoadingContext.get().getModEventBus();
        ModItems.register(modEventBus);
        ModBlocks.register(modEventBus);
        ModBlockEntities.register(modEventBus);
        ModEntities.register(modEventBus);
        ModCreativeModeTabs.register(modEventBus);
        LOGGER.info("{{name}} loaded");
    }
}
