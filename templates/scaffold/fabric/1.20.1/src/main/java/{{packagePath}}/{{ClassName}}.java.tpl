package {{package}};

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** {{name}} 的 Fabric 入口。 */
public class {{ClassName}} implements ModInitializer {
    public static final String MODID = "{{modid}}";
    public static final Logger LOGGER = LoggerFactory.getLogger(MODID);

    @Override
    public void onInitialize() {
        LOGGER.info("{{name}} loaded");
    }
}
