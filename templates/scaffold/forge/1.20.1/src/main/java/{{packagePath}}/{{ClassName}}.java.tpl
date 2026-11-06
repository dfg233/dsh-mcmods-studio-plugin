package {{package}};

import com.mojang.logging.LogUtils;
import net.minecraftforge.fml.common.Mod;
import org.slf4j.Logger;

/** {{name}} 的 Forge 入口。 */
@Mod({{ClassName}}.MODID)
public class {{ClassName}} {
    public static final String MODID = "{{modid}}";
    private static final Logger LOGGER = LogUtils.getLogger();

    public {{ClassName}}() {
        LOGGER.info("{{name}} loaded");
    }
}
